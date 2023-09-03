// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as fs from 'fs';
import * as os from 'os';
import * as readline from 'readline';
import { once } from 'events';
import { getRepoRoot } from '@rushstack/package-deps-hash';
import { Colors, Path, ITerminal, FileSystemStats, FileSystem } from '@rushstack/node-core-library';

import { Git } from './Git';
import { ProjectChangeAnalyzer } from './ProjectChangeAnalyzer';
import { RushConfiguration } from '../api/RushConfiguration';
import { RushConfigurationProject } from '../api/RushConfigurationProject';

export interface IProjectWatcherOptions {
  debounceMs?: number;
  rushConfiguration: RushConfiguration;
  projectsToWatch: ReadonlySet<RushConfigurationProject>;
  terminal: ITerminal;
  initialState?: ProjectChangeAnalyzer | undefined;
}

export interface IProjectChangeResult {
  /**
   * The set of projects that have changed since the last iteration
   */
  changedProjects: ReadonlySet<RushConfigurationProject>;
  /**
   * Contains the git hashes for all tracked files in the repo
   */
  state: ProjectChangeAnalyzer;
}

interface IPathWatchOptions {
  recurse: boolean;
}

/**
 * This class is for incrementally watching a set of projects in the repository for changes.
 *
 * We are manually using fs.watch() instead of `chokidar` because all we want from the file system watcher is a boolean
 * signal indicating that "at least 1 file in a watched project changed". We then defer to ProjectChangeAnalyzer (which
 * is responsible for change detection in all incremental builds) to determine what actually chanaged.
 *
 * Calling `waitForChange()` will return a promise that resolves when the package-deps of one or
 * more projects differ from the value the previous time it was invoked. The first time will always resolve with the full selection.
 */
export class ProjectWatcher {
  private readonly _debounceMs: number;
  private readonly _repoRoot: string;
  private readonly _rushConfiguration: RushConfiguration;
  private readonly _projectsToWatch: ReadonlySet<RushConfigurationProject>;
  private readonly _terminal: ITerminal;

  private _initialState: ProjectChangeAnalyzer | undefined;
  private _previousState: ProjectChangeAnalyzer | undefined;

  private _hasRenderedStatus: boolean;

  public constructor(options: IProjectWatcherOptions) {
    const { debounceMs = 1000, rushConfiguration, projectsToWatch, terminal, initialState } = options;

    this._debounceMs = debounceMs;
    this._rushConfiguration = rushConfiguration;
    this._projectsToWatch = projectsToWatch;
    this._terminal = terminal;

    const gitPath: string = new Git(rushConfiguration).getGitPathOrThrow();
    this._repoRoot = Path.convertToSlashes(getRepoRoot(rushConfiguration.rushJsonFolder, gitPath));

    this._initialState = initialState;
    this._previousState = initialState;

    this._hasRenderedStatus = false;
  }

  /**
   * Waits for a change to the package-deps of one or more of the selected projects, since the previous invocation.
   * Will return immediately the first time it is invoked, since no state has been recorded.
   * If no change is currently present, watches the source tree of all selected projects for file changes.
   */
  public async waitForChange(onWatchingFiles?: () => void): Promise<IProjectChangeResult> {
    const initialChangeResult: IProjectChangeResult = await this._computeChanged();
    // Ensure that the new state is recorded so that we don't loop infinitely
    this._commitChanges(initialChangeResult.state);
    if (initialChangeResult.changedProjects.size) {
      return initialChangeResult;
    }

    const previousState: ProjectChangeAnalyzer = initialChangeResult.state;
    const repoRoot: string = Path.convertToSlashes(this._rushConfiguration.rushJsonFolder);

    // Map of path to whether config for the path
    const pathsToWatch: Map<string, IPathWatchOptions> = new Map();

    // Node 12 supports the "recursive" parameter to fs.watch only on win32 and OSX
    // https://nodejs.org/docs/latest-v12.x/api/fs.html#fs_caveats
    const useNativeRecursiveWatch: boolean = os.platform() === 'win32' || os.platform() === 'darwin';

    if (useNativeRecursiveWatch) {
      // Watch the root non-recursively
      pathsToWatch.set(repoRoot, { recurse: false });

      // Watch the rush config folder non-recursively
      pathsToWatch.set(Path.convertToSlashes(this._rushConfiguration.commonRushConfigFolder), {
        recurse: false
      });

      for (const project of this._projectsToWatch) {
        // Use recursive watch in individual project folders
        pathsToWatch.set(Path.convertToSlashes(project.projectFolder), { recurse: true });
      }
    } else {
      for (const project of this._projectsToWatch) {
        const projectState: Map<string, string> = (await previousState._tryGetProjectDependenciesAsync(
          project,
          this._terminal
        ))!;

        const prefixLength: number = project.projectFolder.length - repoRoot.length - 1;
        // Watch files in the root of the project, or
        for (const pathToWatch of ProjectWatcher._enumeratePathsToWatch(projectState.keys(), prefixLength)) {
          pathsToWatch.set(`${this._repoRoot}/${pathToWatch}`, { recurse: true });
        }
      }
    }

    const watchers: Map<string, fs.FSWatcher> = new Map();

    const watchedResult: IProjectChangeResult = await new Promise(
      (resolve: (result: IProjectChangeResult) => void, reject: (err: Error) => void) => {
        let timeout: NodeJS.Timeout | undefined;
        let terminated: boolean = false;

        const terminal: ITerminal = this._terminal;

        const debounceMs: number = this._debounceMs;

        this._hasRenderedStatus = false;

        const resolveIfChanged = async (): Promise<void> => {
          timeout = undefined;
          if (terminated) {
            return;
          }

          try {
            this._setStatus(`Evaluating changes to tracked files...`);
            const result: IProjectChangeResult = await this._computeChanged();
            this._setStatus(`Finished analyzing.`);

            // Need an async tick to allow for more file system events to be handled
            process.nextTick(() => {
              if (timeout) {
                // If another file has changed, wait for another pass.
                this._setStatus(`More file changes detected, aborting.`);
                return;
              }

              this._commitChanges(result.state);

              if (result.changedProjects.size) {
                terminated = true;
                terminal.writeLine();
                resolve(result);
              } else {
                this._setStatus(`No changes detected to tracked files.`);
              }
            });
          } catch (err) {
            // eslint-disable-next-line require-atomic-updates
            terminated = true;
            terminal.writeLine();
            reject(err as NodeJS.ErrnoException);
          }
        };

        for (const [pathToWatch, { recurse }] of pathsToWatch) {
          addWatcher(pathToWatch, recurse);
        }

        if (onWatchingFiles) {
          onWatchingFiles();
        }

        function onError(err: Error): void {
          if (terminated) {
            return;
          }

          terminated = true;
          terminal.writeLine();
          reject(err);
        }

        function addWatcher(watchedPath: string, recursive: boolean): void {
          if (watchers.has(watchedPath)) {
            return;
          }
          const listener: (event: string, fileName: string) => void = changeListener(watchedPath, recursive);
          const watcher: fs.FSWatcher = fs.watch(
            watchedPath,
            {
              encoding: 'utf-8',
              recursive: recursive && useNativeRecursiveWatch
            },
            listener
          );
          watchers.set(watchedPath, watcher);
          watcher.on('error', (err) => {
            watchers.delete(watchedPath);
            onError(err);
          });
        }

        function innerListener(root: string, recursive: boolean, event: string, fileName: string): void {
          try {
            if (terminated) {
              return;
            }

            if (fileName === '.git' || fileName === 'node_modules') {
              return;
            }

            // Handling for added directories
            if (recursive && !useNativeRecursiveWatch) {
              const decodedName: string = fileName && fileName.toString();
              const normalizedName: string = decodedName && Path.convertToSlashes(decodedName);
              const fullName: string = normalizedName && `${root}/${normalizedName}`;

              if (fullName && !watchers.has(fullName)) {
                try {
                  const stat: FileSystemStats = FileSystem.getStatistics(fullName);
                  if (stat.isDirectory()) {
                    addWatcher(fullName, true);
                  }
                } catch (err) {
                  const code: string | undefined = (err as NodeJS.ErrnoException).code;

                  if (code !== 'ENOENT' && code !== 'ENOTDIR') {
                    throw err;
                  }
                }
              }
            }

            // Use a timeout to debounce changes, e.g. bulk copying files into the directory while the watcher is running.
            if (timeout) {
              clearTimeout(timeout);
            }

            timeout = setTimeout(resolveIfChanged, debounceMs);
          } catch (err) {
            terminated = true;
            terminal.writeLine();
            reject(err as NodeJS.ErrnoException);
          }
        }

        function changeListener(root: string, recursive: boolean): (event: string, fileName: string) => void {
          return innerListener.bind(0, root, recursive);
        }
      }
    );

    const closePromises: Promise<void>[] = [];
    for (const [watchedPath, watcher] of watchers) {
      closePromises.push(
        once(watcher, 'close').then(() => {
          watchers.delete(watchedPath);
        })
      );
      watcher.close();
    }

    await Promise.all(closePromises);

    return watchedResult;
  }

  private _setStatus(status: string): void {
    if (this._hasRenderedStatus) {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
    } else {
      this._hasRenderedStatus = true;
    }
    this._terminal.write(Colors.bold(Colors.cyan(`Watch Status: ${status}`)));
  }

  /**
   * Determines which, if any, projects (within the selection) have new hashes for files that are not in .gitignore
   */
  private async _computeChanged(): Promise<IProjectChangeResult> {
    const state: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(this._rushConfiguration);

    const previousState: ProjectChangeAnalyzer | undefined = this._previousState;

    if (!previousState) {
      return {
        changedProjects: this._projectsToWatch,
        state
      };
    }

    const changedProjects: Set<RushConfigurationProject> = new Set();
    for (const project of this._projectsToWatch) {
      const [previous, current] = await Promise.all([
        previousState._tryGetProjectDependenciesAsync(project, this._terminal),
        state._tryGetProjectDependenciesAsync(project, this._terminal)
      ]);

      if (ProjectWatcher._haveProjectDepsChanged(previous, current)) {
        // May need to detect if the nature of the change will break the process, e.g. changes to package.json
        changedProjects.add(project);
      }
    }

    return {
      changedProjects,
      state
    };
  }

  private _commitChanges(state: ProjectChangeAnalyzer): void {
    this._previousState = state;
    if (!this._initialState) {
      this._initialState = state;
    }
  }

  /**
   * Tests for inequality of the passed Maps. Order invariant.
   *
   * @returns `true` if the maps are different, `false` otherwise
   */
  private static _haveProjectDepsChanged(
    prev: Map<string, string> | undefined,
    next: Map<string, string> | undefined
  ): boolean {
    if (!prev && !next) {
      return false;
    }

    if (!prev || !next) {
      return true;
    }

    if (prev.size !== next.size) {
      return true;
    }

    for (const [key, value] of prev) {
      if (next.get(key) !== value) {
        return true;
      }
    }

    return false;
  }

  private static *_enumeratePathsToWatch(paths: Iterable<string>, prefixLength: number): Iterable<string> {
    for (const path of paths) {
      const rootSlashIndex: number = path.indexOf('/', prefixLength);

      if (rootSlashIndex < 0) {
        yield path;
        return;
      }

      yield path.slice(0, rootSlashIndex);

      let slashIndex: number = path.indexOf('/', rootSlashIndex + 1);
      while (slashIndex >= 0) {
        yield path.slice(0, slashIndex);
        slashIndex = path.indexOf('/', slashIndex + 1);
      }
    }
  }
}
