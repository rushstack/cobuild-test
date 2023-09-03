// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AlreadyReportedError, Async, type ITerminal, Path } from '@rushstack/node-core-library';
import { ConfigurationFile, InheritanceType } from '@rushstack/heft-config-file';
import { RigConfig } from '@rushstack/rig-package';

import { RushConfigurationProject } from './RushConfigurationProject';
import { RushConstants } from '../logic/RushConstants';
import type { IPhase } from './CommandLineConfiguration';
import { OverlappingPathAnalyzer } from '../utilities/OverlappingPathAnalyzer';
import schemaJson from '../schemas/rush-project.schema.json';
import anythingSchemaJson from '../schemas/rush-project.schema.json';

/**
 * Describes the file structure for the `<project root>/config/rush-project.json` config file.
 * @internal
 */
export interface IRushProjectJson {
  /**
   * The incremental analyzer can skip Rush commands for projects whose input files have
   * not changed since the last build. Normally, every Git-tracked file under the project
   * folder is assumed to be an input. Set incrementalBuildIgnoredGlobs to ignore specific
   * files, specified as globs relative to the project folder. The list of file globs will
   * be interpreted the same way your .gitignore file is.
   */
  incrementalBuildIgnoredGlobs?: string[];

  /**
   * Disable caching for this project. The project will never be restored from cache.
   * This may be useful if this project affects state outside of its folder.
   *
   * This option is only used when the build cache is enabled for the repo. You can set
   * disableBuildCacheForProject=true to disable caching for a specific project. This is a useful workaround
   * if that project's build scripts violate the assumptions of the cache, for example by writing
   * files outside the project folder. Where possible, a better solution is to improve the build scripts
   * to be compatible with caching.
   */
  disableBuildCacheForProject?: boolean;

  operationSettings?: IOperationSettings[];
}

/**
 * @alpha
 */
export interface IOperationSettings {
  /**
   * The name of the operation. This should be a key in the `package.json`'s `scripts` object.
   */
  operationName: string;

  /**
   * Specify the folders where this operation writes its output files. If enabled, the Rush build
   * cache will restore these folders from the cache. The strings are folder names under the project
   * root folder.
   *
   * These folders should not be tracked by Git. They must not contain symlinks.
   */
  outputFolderNames?: string[];

  /**
   * Disable caching for this operation. The operation will never be restored from cache.
   * This may be useful if this operation affects state outside of its folder.
   *
   * This option is only used when the build cache is enabled for the repo. You can set
   * disableBuildCacheForOperation=true to disable caching for a specific project operation.
   * This is a useful workaround if that project's build scripts violate the assumptions of the cache,
   * for example by writing files outside the project folder. Where possible, a better solution is to improve
   * the build scripts to be compatible with caching.
   */
  disableBuildCacheForOperation?: boolean;

  /**
   * An optional list of environment variables that can affect this operation. The values of
   * these environment variables will become part of the hash when reading and writing the build cache.
   *
   * Note: generally speaking, all environment variables available to Rush are also available to any
   * operations performed -- Rush assumes that environment variables do not affect build outputs unless
   * you list them here.
   */
  dependsOnEnvVars?: string[];

  /**
   * An optional list of glob (minimatch) patterns pointing to files that can affect this operation.
   * The hash values of the contents of these files will become part of the final hash when reading
   * and writing the build cache.
   *
   * Note: if a particular file will be matched by patterns provided by both `incrementalBuildIgnoredGlobs` and
   * `dependsOnAdditionalFiles` options - `dependsOnAdditionalFiles` will win and the file will be included
   * calculating final hash value when reading and writing the build cache
   */
  dependsOnAdditionalFiles?: string[];
}

interface IOldRushProjectJson {
  projectOutputFolderNames?: unknown;
  phaseOptions?: unknown;
  buildCacheOptions?: unknown;
}

const RUSH_PROJECT_CONFIGURATION_FILE: ConfigurationFile<IRushProjectJson> =
  new ConfigurationFile<IRushProjectJson>({
    projectRelativeFilePath: `config/${RushConstants.rushProjectConfigFilename}`,
    jsonSchemaObject: schemaJson,
    propertyInheritance: {
      operationSettings: {
        inheritanceType: InheritanceType.custom,
        inheritanceFunction: (
          child: IOperationSettings[] | undefined,
          parent: IOperationSettings[] | undefined
        ) => {
          if (!child) {
            return parent;
          } else if (!parent) {
            return child;
          } else {
            // Merge any properties that need to be merged
            const resultOperationSettingsByOperationName: Map<string, IOperationSettings> = new Map();
            for (const parentOperationSettings of parent) {
              resultOperationSettingsByOperationName.set(
                parentOperationSettings.operationName,
                parentOperationSettings
              );
            }

            const childEncounteredOperationNames: Set<string> = new Set();
            for (const childOperationSettings of child) {
              const operationName: string = childOperationSettings.operationName;
              if (childEncounteredOperationNames.has(operationName)) {
                // If the operation settings already exist, but didn't come from the parent, then
                // it shows up multiple times in the child.
                const childSourceFilePath: string =
                  RUSH_PROJECT_CONFIGURATION_FILE.getObjectSourceFilePath(child)!;
                throw new Error(
                  `The operation "${operationName}" occurs multiple times in the "operationSettings" array ` +
                    `in "${childSourceFilePath}".`
                );
              }

              childEncounteredOperationNames.add(operationName);

              let mergedOperationSettings: IOperationSettings | undefined =
                resultOperationSettingsByOperationName.get(operationName);
              if (mergedOperationSettings) {
                // The parent operation settings object already exists
                const outputFolderNames: string[] | undefined =
                  mergedOperationSettings.outputFolderNames && childOperationSettings.outputFolderNames
                    ? [
                        ...mergedOperationSettings.outputFolderNames,
                        ...childOperationSettings.outputFolderNames
                      ]
                    : mergedOperationSettings.outputFolderNames || childOperationSettings.outputFolderNames;

                const dependsOnEnvVars: string[] | undefined =
                  mergedOperationSettings.dependsOnEnvVars && childOperationSettings.dependsOnEnvVars
                    ? [
                        ...mergedOperationSettings.dependsOnEnvVars,
                        ...childOperationSettings.dependsOnEnvVars
                      ]
                    : mergedOperationSettings.dependsOnEnvVars || childOperationSettings.dependsOnEnvVars;

                mergedOperationSettings = {
                  ...mergedOperationSettings,
                  ...childOperationSettings,
                  ...(outputFolderNames ? { outputFolderNames } : {}),
                  ...(dependsOnEnvVars ? { dependsOnEnvVars } : {})
                };
                resultOperationSettingsByOperationName.set(operationName, mergedOperationSettings);
              } else {
                resultOperationSettingsByOperationName.set(operationName, childOperationSettings);
              }
            }

            return Array.from(resultOperationSettingsByOperationName.values());
          }
        }
      },
      incrementalBuildIgnoredGlobs: {
        inheritanceType: InheritanceType.replace
      }
    }
  });

const OLD_RUSH_PROJECT_CONFIGURATION_FILE: ConfigurationFile<IOldRushProjectJson> =
  new ConfigurationFile<IOldRushProjectJson>({
    projectRelativeFilePath: RUSH_PROJECT_CONFIGURATION_FILE.projectRelativeFilePath,
    jsonSchemaObject: anythingSchemaJson
  });

/**
 * Use this class to load the "config/rush-project.json" config file.
 *
 * This file provides project-specific configuration options.
 * @alpha
 */
export class RushProjectConfiguration {
  private static readonly _configCache: Map<RushConfigurationProject, RushProjectConfiguration | false> =
    new Map();

  public readonly project: RushConfigurationProject;

  /**
   * {@inheritdoc _IRushProjectJson.incrementalBuildIgnoredGlobs}
   */
  public readonly incrementalBuildIgnoredGlobs: ReadonlyArray<string>;

  /**
   * {@inheritdoc _IRushProjectJson.disableBuildCacheForProject}
   */
  public readonly disableBuildCacheForProject: boolean;

  public readonly operationSettingsByOperationName: ReadonlyMap<string, Readonly<IOperationSettings>>;

  private readonly _validationCache: WeakSet<object> = new WeakSet();

  private constructor(
    project: RushConfigurationProject,
    rushProjectJson: IRushProjectJson,
    operationSettingsByOperationName: ReadonlyMap<string, IOperationSettings>
  ) {
    this.project = project;
    this.incrementalBuildIgnoredGlobs = rushProjectJson.incrementalBuildIgnoredGlobs || [];
    this.disableBuildCacheForProject = rushProjectJson.disableBuildCacheForProject || false;
    this.operationSettingsByOperationName = operationSettingsByOperationName;
  }

  /**
   * Validates that the requested phases are compatible.
   * Deferral of this logic to its own method means that Rush no longer eagerly validates
   * all defined commands in command-line.json. As such, while validation will be run for a given
   * command upon invoking that command, defining overlapping phases in "rush custom-command"
   * that are not used by "rush build" will not cause "rush build" to exit with an error.
   */
  public validatePhaseConfiguration(phases: Iterable<IPhase>, terminal: ITerminal): void {
    // Don't repeatedly validate the same set of phases for the same project.
    if (this._validationCache.has(phases)) {
      return;
    }

    const overlappingPathAnalyzer: OverlappingPathAnalyzer<string> = new OverlappingPathAnalyzer<string>();

    const { operationSettingsByOperationName, project } = this;

    let hasErrors: boolean = false;

    for (const phase of phases) {
      const operationName: string = phase.name;
      const operationSettings: IOperationSettings | undefined =
        operationSettingsByOperationName.get(operationName);
      if (operationSettings) {
        if (operationSettings.outputFolderNames) {
          for (const outputFolderName of operationSettings.outputFolderNames) {
            const overlappingOperationNames: string[] | undefined =
              overlappingPathAnalyzer.addPathAndGetFirstEncounteredLabels(outputFolderName, operationName);
            if (overlappingOperationNames) {
              const overlapsWithOwnOperation: boolean = overlappingOperationNames?.includes(operationName);
              if (overlapsWithOwnOperation) {
                terminal.writeErrorLine(
                  `The project "${project.packageName}" has a ` +
                    `"${RUSH_PROJECT_CONFIGURATION_FILE.projectRelativeFilePath}" configuration that defines an ` +
                    `operation with overlapping paths in the "outputFolderNames" list. The operation is ` +
                    `"${operationName}", and the conflicting path is "${outputFolderName}".`
                );
              } else {
                terminal.writeErrorLine(
                  `The project "${project.packageName}" has a ` +
                    `"${RUSH_PROJECT_CONFIGURATION_FILE.projectRelativeFilePath}" configuration that defines ` +
                    'two operations in the same command whose "outputFolderNames" would overlap. ' +
                    'Operations outputs in the same command must be disjoint so that they can be independently cached.' +
                    `\n\n` +
                    `The "${outputFolderName}" path overlaps between these operations: ` +
                    overlappingOperationNames.map((operationName) => `"${operationName}"`).join(', ')
                );
              }

              hasErrors = true;
            }
          }
        }
      }
    }

    this._validationCache.add(phases);

    if (hasErrors) {
      throw new AlreadyReportedError();
    }
  }

  /**
   * Examines the list of source files for the project and the target phase and returns a reason
   * why the project cannot enable the build cache for that phase, or undefined if it is safe to so do.
   */
  public getCacheDisabledReason(trackedFileNames: Iterable<string>, phaseName: string): string | undefined {
    if (this.disableBuildCacheForProject) {
      return 'Caching has been disabled for this project.';
    }

    const normalizedProjectRelativeFolder: string = Path.convertToSlashes(this.project.projectRelativeFolder);

    const operationSettings: IOperationSettings | undefined =
      this.operationSettingsByOperationName.get(phaseName);
    if (!operationSettings) {
      return `This project does not define the caching behavior of the "${phaseName}" command, so caching has been disabled.`;
    }

    if (operationSettings.disableBuildCacheForOperation) {
      return `Caching has been disabled for this project's "${phaseName}" command.`;
    }

    const { outputFolderNames } = operationSettings;
    if (!outputFolderNames) {
      return;
    }

    const normalizedOutputFolders: string[] = outputFolderNames.map(
      (outputFolderName) => `${normalizedProjectRelativeFolder}/${outputFolderName}/`
    );

    const inputOutputFiles: string[] = [];
    for (const file of trackedFileNames) {
      for (const outputFolder of normalizedOutputFolders) {
        if (file.startsWith(outputFolder)) {
          inputOutputFiles.push(file);
        }
      }
    }

    if (inputOutputFiles.length > 0) {
      return (
        'The following files are used to calculate project state ' +
        `and are considered project output: ${inputOutputFiles.join(', ')}`
      );
    }
  }

  /**
   * Loads the rush-project.json data for the specified project.
   */
  public static async tryLoadForProjectAsync(
    project: RushConfigurationProject,
    terminal: ITerminal
  ): Promise<RushProjectConfiguration | undefined> {
    // false is a signal that the project config does not exist
    const cacheEntry: RushProjectConfiguration | false | undefined =
      RushProjectConfiguration._configCache.get(project);
    if (cacheEntry !== undefined) {
      return cacheEntry || undefined;
    }

    const rushProjectJson: IRushProjectJson | undefined = await this._tryLoadJsonForProjectAsync(
      project,
      terminal
    );

    if (rushProjectJson) {
      const result: RushProjectConfiguration = RushProjectConfiguration._getRushProjectConfiguration(
        project,
        rushProjectJson,
        terminal
      );
      RushProjectConfiguration._configCache.set(project, result);
      return result;
    } else {
      RushProjectConfiguration._configCache.set(project, false);
      return undefined;
    }
  }

  /**
   * Load only the `incrementalBuildIgnoredGlobs` property from the rush-project.json file, skipping
   * validation of other parts of the config file.
   *
   * @remarks
   * This function exists to allow the ProjectChangeAnalyzer to load just the ignore globs without
   * having to validate the rest of the `rush-project.json` file against the repo's command-line configuration.
   */
  public static async tryLoadIgnoreGlobsForProjectAsync(
    project: RushConfigurationProject,
    terminal: ITerminal
  ): Promise<ReadonlyArray<string> | undefined> {
    const rushProjectJson: IRushProjectJson | undefined = await this._tryLoadJsonForProjectAsync(
      project,
      terminal
    );

    return rushProjectJson?.incrementalBuildIgnoredGlobs;
  }

  /**
   * Load the rush-project.json data for all selected projects.
   * Validate compatibility of output folders across all selected phases.
   */
  public static async tryLoadAndValidateForProjectsAsync(
    projects: Iterable<RushConfigurationProject>,
    phases: ReadonlySet<IPhase>,
    terminal: ITerminal
  ): Promise<ReadonlyMap<RushConfigurationProject, RushProjectConfiguration>> {
    const result: Map<RushConfigurationProject, RushProjectConfiguration> = new Map();

    await Async.forEachAsync(projects, async (project: RushConfigurationProject) => {
      const projectConfig: RushProjectConfiguration | undefined =
        await RushProjectConfiguration.tryLoadForProjectAsync(project, terminal);
      if (projectConfig) {
        projectConfig.validatePhaseConfiguration(phases, terminal);
        result.set(project, projectConfig);
      }
    });

    return result;
  }

  private static async _tryLoadJsonForProjectAsync(
    project: RushConfigurationProject,
    terminal: ITerminal
  ): Promise<IRushProjectJson | undefined> {
    const rigConfig: RigConfig = await RigConfig.loadForProjectFolderAsync({
      projectFolderPath: project.projectFolder
    });

    try {
      return await RUSH_PROJECT_CONFIGURATION_FILE.tryLoadConfigurationFileForProjectAsync(
        terminal,
        project.projectFolder,
        rigConfig
      );
    } catch (e) {
      // Detect if the project is using the old rush-project.json schema
      let oldRushProjectJson: IOldRushProjectJson | undefined;
      try {
        oldRushProjectJson =
          await OLD_RUSH_PROJECT_CONFIGURATION_FILE.tryLoadConfigurationFileForProjectAsync(
            terminal,
            project.projectFolder,
            rigConfig
          );
      } catch (e) {
        // Ignore
      }

      if (
        oldRushProjectJson?.projectOutputFolderNames ||
        oldRushProjectJson?.phaseOptions ||
        oldRushProjectJson?.buildCacheOptions
      ) {
        throw new Error(
          `The ${RUSH_PROJECT_CONFIGURATION_FILE.projectRelativeFilePath} file appears to be ` +
            'in an outdated format. Please see the UPGRADING.md notes for details. ' +
            'Quick link: https://rushjs.io/link/upgrading'
        );
      } else {
        throw e;
      }
    }
  }

  private static _getRushProjectConfiguration(
    project: RushConfigurationProject,
    rushProjectJson: IRushProjectJson,
    terminal: ITerminal
  ): RushProjectConfiguration {
    const operationSettingsByOperationName: Map<string, IOperationSettings> = new Map<
      string,
      IOperationSettings
    >();

    let hasErrors: boolean = false;

    if (rushProjectJson.operationSettings) {
      for (const operationSettings of rushProjectJson.operationSettings) {
        const operationName: string = operationSettings.operationName;
        const existingOperationSettings: IOperationSettings | undefined =
          operationSettingsByOperationName.get(operationName);
        if (existingOperationSettings) {
          const existingOperationSettingsJsonPath: string | undefined =
            RUSH_PROJECT_CONFIGURATION_FILE.getObjectSourceFilePath(existingOperationSettings);
          const operationSettingsJsonPath: string | undefined =
            RUSH_PROJECT_CONFIGURATION_FILE.getObjectSourceFilePath(operationSettings);
          hasErrors = true;
          let errorMessage: string =
            `The operation "${operationName}" appears multiple times in the "${project.packageName}" project's ` +
            `${RUSH_PROJECT_CONFIGURATION_FILE.projectRelativeFilePath} file's ` +
            'operationSettings property.';
          if (existingOperationSettingsJsonPath && operationSettingsJsonPath) {
            if (existingOperationSettingsJsonPath !== operationSettingsJsonPath) {
              errorMessage +=
                ` It first appears in "${existingOperationSettingsJsonPath}" and again ` +
                `in "${operationSettingsJsonPath}".`;
            } else if (
              !Path.convertToSlashes(existingOperationSettingsJsonPath).startsWith(
                Path.convertToSlashes(project.projectFolder)
              )
            ) {
              errorMessage += ` It appears multiple times in "${operationSettingsJsonPath}".`;
            }
          }

          terminal.writeErrorLine(errorMessage);
        } else {
          operationSettingsByOperationName.set(operationName, operationSettings);
        }
      }
    }

    if (hasErrors) {
      throw new AlreadyReportedError();
    }

    return new RushProjectConfiguration(project, rushProjectJson, operationSettingsByOperationName);
  }
}
