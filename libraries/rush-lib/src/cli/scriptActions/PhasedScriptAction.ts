// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import colors from 'colors/safe';
import type { AsyncSeriesHook } from 'tapable';

import { AlreadyReportedError, InternalError, ITerminal, Terminal } from '@rushstack/node-core-library';
import {
  CommandLineFlagParameter,
  CommandLineParameter,
  CommandLineStringParameter
} from '@rushstack/ts-command-line';

import type { IPhasedCommand } from '../../pluginFramework/RushLifeCycle';
import { PhasedCommandHooks, ICreateOperationsContext } from '../../pluginFramework/PhasedCommandHooks';
import { SetupChecks } from '../../logic/SetupChecks';
import { Stopwatch, StopwatchState } from '../../utilities/Stopwatch';
import { BaseScriptAction, IBaseScriptActionOptions } from './BaseScriptAction';
import {
  IOperationExecutionManagerOptions,
  OperationExecutionManager
} from '../../logic/operations/OperationExecutionManager';
import { RushConstants } from '../../logic/RushConstants';
import { EnvironmentVariableNames } from '../../api/EnvironmentConfiguration';
import { LastLinkFlag, LastLinkFlagFactory } from '../../api/LastLinkFlag';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { BuildCacheConfiguration } from '../../api/BuildCacheConfiguration';
import { SelectionParameterSet } from '../parsing/SelectionParameterSet';
import type { IPhase, IPhasedCommandConfig } from '../../api/CommandLineConfiguration';
import { Operation } from '../../logic/operations/Operation';
import { OperationExecutionRecord } from '../../logic/operations/OperationExecutionRecord';
import { PhasedOperationPlugin } from '../../logic/operations/PhasedOperationPlugin';
import { ShellOperationRunnerPlugin } from '../../logic/operations/ShellOperationRunnerPlugin';
import { Event } from '../../api/EventHooks';
import { ProjectChangeAnalyzer } from '../../logic/ProjectChangeAnalyzer';
import { OperationStatus } from '../../logic/operations/OperationStatus';
import { IExecutionResult } from '../../logic/operations/IOperationExecutionResult';
import { OperationResultSummarizerPlugin } from '../../logic/operations/OperationResultSummarizerPlugin';
import type { ITelemetryData, ITelemetryOperationResult } from '../../logic/Telemetry';
import { parseParallelism } from '../parsing/ParseParallelism';
import { CobuildConfiguration } from '../../api/CobuildConfiguration';
import { CacheableOperationPlugin } from '../../logic/operations/CacheableOperationPlugin';
import { RushProjectConfiguration } from '../../api/RushProjectConfiguration';
import { LegacySkipPlugin } from '../../logic/operations/LegacySkipPlugin';

/**
 * Constructor parameters for PhasedScriptAction.
 */
export interface IPhasedScriptActionOptions extends IBaseScriptActionOptions<IPhasedCommandConfig> {
  enableParallelism: boolean;
  incremental: boolean;
  disableBuildCache: boolean;

  originalPhases: Set<IPhase>;
  initialPhases: Set<IPhase>;
  watchPhases: Set<IPhase>;
  phases: Map<string, IPhase>;

  alwaysWatch: boolean;
  alwaysInstall: boolean | undefined;

  watchDebounceMs: number | undefined;
}

interface IRunPhasesOptions {
  initialCreateOperationsContext: ICreateOperationsContext;
  executionManagerOptions: IOperationExecutionManagerOptions;
  stopwatch: Stopwatch;
  terminal: ITerminal;
}

interface IExecutionOperationsOptions {
  createOperationsContext: ICreateOperationsContext;
  executionManagerOptions: IOperationExecutionManagerOptions;
  ignoreHooks: boolean;
  operations: Set<Operation>;
  stopwatch: Stopwatch;
  terminal: ITerminal;
}

interface IPhasedCommandTelemetry {
  [key: string]: string | number | boolean;
  isInitial: boolean;
  isWatch: boolean;

  countAll: number;
  countSuccess: number;
  countSuccessWithWarnings: number;
  countFailure: number;
  countBlocked: number;
  countFromCache: number;
  countSkipped: number;
  countNoOp: number;
}

/**
 * This class implements phased commands which are run individually for each project in the repo,
 * possibly in parallel, and which may define multiple phases.
 *
 * @remarks
 * Phased commands can be defined via common/config/command-line.json.  Rush's predefined "build"
 * and "rebuild" commands are also modeled as phased commands with a single phase that invokes the npm
 * "build" script for each project.
 */
export class PhasedScriptAction extends BaseScriptAction<IPhasedCommandConfig> {
  public readonly hooks: PhasedCommandHooks;

  private readonly _enableParallelism: boolean;
  private readonly _isIncrementalBuildAllowed: boolean;
  private readonly _disableBuildCache: boolean;
  private readonly _originalPhases: ReadonlySet<IPhase>;
  private readonly _initialPhases: ReadonlySet<IPhase>;
  private readonly _watchPhases: ReadonlySet<IPhase>;
  private readonly _watchDebounceMs: number;
  private readonly _alwaysWatch: boolean;
  private readonly _alwaysInstall: boolean | undefined;
  private readonly _knownPhases: ReadonlyMap<string, IPhase>;
  private readonly _terminal: ITerminal;

  private readonly _changedProjectsOnly: CommandLineFlagParameter | undefined;
  private readonly _selectionParameters: SelectionParameterSet;
  private readonly _verboseParameter: CommandLineFlagParameter;
  private readonly _parallelismParameter: CommandLineStringParameter | undefined;
  private readonly _ignoreHooksParameter: CommandLineFlagParameter;
  private readonly _watchParameter: CommandLineFlagParameter | undefined;
  private readonly _timelineParameter: CommandLineFlagParameter | undefined;
  private readonly _installParameter: CommandLineFlagParameter | undefined;

  public constructor(options: IPhasedScriptActionOptions) {
    super(options);
    this._enableParallelism = options.enableParallelism;
    this._isIncrementalBuildAllowed = options.incremental;
    this._disableBuildCache = options.disableBuildCache;
    this._originalPhases = options.originalPhases;
    this._initialPhases = options.initialPhases;
    this._watchPhases = options.watchPhases;
    this._watchDebounceMs = options.watchDebounceMs ?? RushConstants.defaultWatchDebounceMs;
    this._alwaysWatch = options.alwaysWatch;
    this._alwaysInstall = options.alwaysInstall;
    this._knownPhases = options.phases;

    this.hooks = new PhasedCommandHooks();

    const terminal: Terminal = new Terminal(this.rushSession.terminalProvider);
    this._terminal = terminal;

    // Generates the default operation graph
    new PhasedOperationPlugin().apply(this.hooks);
    // Applies the Shell Operation Runner to selected operations
    new ShellOperationRunnerPlugin().apply(this.hooks);

    if (this._enableParallelism) {
      this._parallelismParameter = this.defineStringParameter({
        parameterLongName: '--parallelism',
        parameterShortName: '-p',
        argumentName: 'COUNT',
        environmentVariable: EnvironmentVariableNames.RUSH_PARALLELISM,
        description:
          'Specifies the maximum number of concurrent processes to launch during a build.' +
          ' The COUNT should be a positive integer, a percentage value (eg. "50%%") or the word "max"' +
          ' to specify a count that is equal to the number of CPU cores. If this parameter is omitted,' +
          ' then the default value depends on the operating system and number of CPU cores.'
      });
      this._timelineParameter = this.defineFlagParameter({
        parameterLongName: '--timeline',
        description:
          'After the build is complete, print additional statistics and CPU usage information,' +
          ' including an ASCII chart of the start and stop times for each operation.'
      });
    }

    this._selectionParameters = new SelectionParameterSet(this.rushConfiguration, this, {
      // Include lockfile processing since this expands the selection, and we need to select
      // at least the same projects selected with the same query to "rush build"
      includeExternalDependencies: true,
      // Enable filtering to reduce evaluation cost
      enableFiltering: true
    });

    this._verboseParameter = this.defineFlagParameter({
      parameterLongName: '--verbose',
      parameterShortName: '-v',
      description: 'Display the logs during the build, rather than just displaying the build status summary'
    });

    if (this._isIncrementalBuildAllowed) {
      this._changedProjectsOnly = this.defineFlagParameter({
        parameterLongName: '--changed-projects-only',
        parameterShortName: '-c',
        description:
          'Normally the incremental build logic will rebuild changed projects as well as' +
          ' any projects that directly or indirectly depend on a changed project. Specify "--changed-projects-only"' +
          ' to ignore dependent projects, only rebuilding those projects whose files were changed.' +
          ' Note that this parameter is "unsafe"; it is up to the developer to ensure that the ignored projects' +
          ' are okay to ignore.'
      });
    }

    this._ignoreHooksParameter = this.defineFlagParameter({
      parameterLongName: '--ignore-hooks',
      description: `Skips execution of the "eventHooks" scripts defined in rush.json. Make sure you know what you are skipping.`
    });

    if (this._watchPhases.size > 0 && !this._alwaysWatch) {
      // Only define the parameter if it has an effect.
      this._watchParameter = this.defineFlagParameter({
        parameterLongName: '--watch',
        description: `Starts a file watcher after initial execution finishes. Will run the following phases on affected projects: ${Array.from(
          this._watchPhases,
          (phase: IPhase) => phase.name
        ).join(', ')}`
      });
    }

    // If `this._alwaysInstall === undefined`, Rush does not define the parameter
    // but a repository may still define a custom parameter with the same name.
    if (this._alwaysInstall === false) {
      this._installParameter = this.defineFlagParameter({
        parameterLongName: '--install',
        description:
          'Normally a phased command expects "rush install" to have been manually run first. If this flag is specified, ' +
          'Rush will automatically perform an install before processing the current command.'
      });
    }

    this.defineScriptParameters();

    for (const [{ associatedPhases }, tsCommandLineParameter] of this.customParameters) {
      if (associatedPhases) {
        for (const phaseName of associatedPhases) {
          const phase: IPhase | undefined = this._knownPhases.get(phaseName);
          if (!phase) {
            throw new InternalError(`Could not find a phase matching ${phaseName}.`);
          }
          phase.associatedParameters.add(tsCommandLineParameter);
        }
      }
    }
  }

  public async runAsync(): Promise<void> {
    if (this._alwaysInstall || this._installParameter?.value) {
      const { doBasicInstallAsync } = await import(
        /* webpackChunkName: 'doBasicInstallAsync' */
        '../../logic/installManager/doBasicInstallAsync'
      );

      await doBasicInstallAsync({
        terminal: this._terminal,
        rushConfiguration: this.rushConfiguration,
        rushGlobalFolder: this.rushGlobalFolder,
        isDebug: this.parser.isDebug
      });
    }

    // TODO: Replace with last-install.flag when "rush link" and "rush unlink" are deprecated
    const lastLinkFlag: LastLinkFlag = LastLinkFlagFactory.getCommonTempFlag(this.rushConfiguration);
    if (!lastLinkFlag.isValid()) {
      const useWorkspaces: boolean =
        this.rushConfiguration.pnpmOptions && this.rushConfiguration.pnpmOptions.useWorkspaces;
      if (useWorkspaces) {
        throw new Error('Link flag invalid.\nDid you run "rush install" or "rush update"?');
      } else {
        throw new Error('Link flag invalid.\nDid you run "rush link"?');
      }
    }

    this._doBeforeTask();

    // if this is parallelizable, then use the value from the flag (undefined or a number),
    // if parallelism is not enabled, then restrict to 1 core
    const parallelism: number = this._enableParallelism
      ? parseParallelism(this._parallelismParameter?.value)
      : 1;

    const terminal: ITerminal = this._terminal;

    const stopwatch: Stopwatch = Stopwatch.start();

    const showTimeline: boolean = this._timelineParameter ? this._timelineParameter.value : false;
    if (showTimeline) {
      const { ConsoleTimelinePlugin } = await import(
        /* webpackChunkName: 'ConsoleTimelinePlugin' */
        '../../logic/operations/ConsoleTimelinePlugin'
      );
      new ConsoleTimelinePlugin(terminal).apply(this.hooks);
    }
    // Enable the standard summary
    new OperationResultSummarizerPlugin(terminal).apply(this.hooks);

    const { hooks: sessionHooks } = this.rushSession;
    if (sessionHooks.runAnyPhasedCommand.isUsed()) {
      // Avoid the cost of compiling the hook if it wasn't tapped.
      await sessionHooks.runAnyPhasedCommand.promise(this);
    }

    const hookForAction: AsyncSeriesHook<IPhasedCommand> | undefined = sessionHooks.runPhasedCommand.get(
      this.actionName
    );

    if (hookForAction) {
      // Run the more specific hook for a command with this name after the general hook
      await hookForAction.promise(this);
    }

    const isQuietMode: boolean = !this._verboseParameter.value;

    const changedProjectsOnly: boolean = !!this._changedProjectsOnly?.value;

    let buildCacheConfiguration: BuildCacheConfiguration | undefined;
    let cobuildConfiguration: CobuildConfiguration | undefined;
    if (!this._disableBuildCache) {
      buildCacheConfiguration = await BuildCacheConfiguration.tryLoadAsync(
        terminal,
        this.rushConfiguration,
        this.rushSession
      );
      cobuildConfiguration = await CobuildConfiguration.tryLoadAsync(
        terminal,
        this.rushConfiguration,
        this.rushSession
      );
      await cobuildConfiguration?.createLockProviderAsync(terminal);
    }

    try {
      const projectSelection: Set<RushConfigurationProject> =
        await this._selectionParameters.getSelectedProjectsAsync(terminal);

      if (!projectSelection.size) {
        terminal.writeLine(
          colors.yellow(`The command line selection parameters did not match any projects.`)
        );
        return;
      }

      const isWatch: boolean = this._watchParameter?.value || this._alwaysWatch;

      const customParametersByName: Map<string, CommandLineParameter> = new Map();
      for (const [configParameter, parserParameter] of this.customParameters) {
        customParametersByName.set(configParameter.longName, parserParameter);
      }

      if (buildCacheConfiguration) {
        new CacheableOperationPlugin({
          allowWarningsInSuccessfulBuild:
            !!this.rushConfiguration.experimentsConfiguration.configuration
              .buildCacheWithAllowWarningsInSuccessfulBuild,
          buildCacheConfiguration,
          cobuildConfiguration,
          terminal
        }).apply(this.hooks);
      } else {
        new LegacySkipPlugin({
          terminal,
          changedProjectsOnly,
          isIncrementalBuildAllowed: this._isIncrementalBuildAllowed
        }).apply(this.hooks);
      }

      const projectConfigurations: ReadonlyMap<RushConfigurationProject, RushProjectConfiguration> =
        await RushProjectConfiguration.tryLoadAndValidateForProjectsAsync(
          projectSelection,
          this._initialPhases,
          terminal
        );

      const projectChangeAnalyzer: ProjectChangeAnalyzer = new ProjectChangeAnalyzer(this.rushConfiguration);
      const initialCreateOperationsContext: ICreateOperationsContext = {
        buildCacheConfiguration,
        cobuildConfiguration,
        customParameters: customParametersByName,
        isIncrementalBuildAllowed: this._isIncrementalBuildAllowed,
        isInitial: true,
        isWatch,
        rushConfiguration: this.rushConfiguration,
        phaseOriginal: new Set(this._originalPhases),
        phaseSelection: new Set(this._initialPhases),
        projectChangeAnalyzer,
        projectSelection,
        projectConfigurations,
        projectsInUnknownState: projectSelection
      };

      const executionManagerOptions: IOperationExecutionManagerOptions = {
        quietMode: isQuietMode,
        debugMode: this.parser.isDebug,
        parallelism,
        changedProjectsOnly,
        beforeExecuteOperation: async (record: OperationExecutionRecord) => {
          return await this.hooks.beforeExecuteOperation.promise(record);
        },
        afterExecuteOperation: async (record: OperationExecutionRecord) => {
          await this.hooks.afterExecuteOperation.promise(record);
        },
        beforeExecuteOperations: async (records: Map<Operation, OperationExecutionRecord>) => {
          await this.hooks.beforeExecuteOperations.promise(records, initialCreateOperationsContext);
        },
        onOperationStatusChanged: (record: OperationExecutionRecord) => {
          this.hooks.onOperationStatusChanged.call(record);
        }
      };

      const internalOptions: IRunPhasesOptions = {
        initialCreateOperationsContext,
        executionManagerOptions,
        stopwatch,
        terminal
      };

      terminal.write('Analyzing repo state... ');
      const repoStateStopwatch: Stopwatch = new Stopwatch();
      repoStateStopwatch.start();
      await projectChangeAnalyzer._ensureInitializedAsync(terminal);
      repoStateStopwatch.stop();
      terminal.writeLine(`DONE (${repoStateStopwatch.toString()})`);
      terminal.writeLine();

      await this._runInitialPhases(internalOptions);

      if (isWatch) {
        if (buildCacheConfiguration) {
          // Cache writes are not supported during watch mode, only reads.
          buildCacheConfiguration.cacheWriteEnabled = false;
        }

        await this._runWatchPhases(internalOptions);
      }
    } finally {
      await cobuildConfiguration?.destroyLockProviderAsync();
    }
  }

  private async _runInitialPhases(options: IRunPhasesOptions): Promise<void> {
    const { initialCreateOperationsContext, executionManagerOptions, stopwatch, terminal } = options;

    const operations: Set<Operation> = await this.hooks.createOperations.promise(
      new Set(),
      initialCreateOperationsContext
    );

    const initialOptions: IExecutionOperationsOptions = {
      createOperationsContext: initialCreateOperationsContext,
      ignoreHooks: false,
      operations,
      stopwatch,
      executionManagerOptions,
      terminal
    };

    await this._executeOperations(initialOptions);
  }

  /**
   * Runs the command in watch mode. Fundamentally is a simple loop:
   * 1) Wait for a change to one or more projects in the selection
   * 2) Invoke the command on the changed projects, and, if applicable, impacted projects
   *    Uses the same algorithm as --impacted-by
   * 3) Goto (1)
   */
  private async _runWatchPhases(options: IRunPhasesOptions): Promise<void> {
    const { initialCreateOperationsContext, executionManagerOptions, stopwatch, terminal } = options;

    const phaseOriginal: Set<IPhase> = new Set(this._watchPhases);
    const phaseSelection: Set<IPhase> = new Set(this._watchPhases);

    const { projectChangeAnalyzer: initialState, projectSelection: projectsToWatch } =
      initialCreateOperationsContext;

    // Use async import so that we don't pay the cost for sync builds
    const { ProjectWatcher } = await import(
      /* webpackChunkName: 'ProjectWatcher' */
      '../../logic/ProjectWatcher'
    );

    const projectWatcher: typeof ProjectWatcher.prototype = new ProjectWatcher({
      debounceMs: this._watchDebounceMs,
      rushConfiguration: this.rushConfiguration,
      projectsToWatch,
      terminal,
      initialState
    });

    const onWaitingForChanges = (): void => {
      // Allow plugins to display their own messages when waiting for changes.
      this.hooks.waitingForChanges.call();

      // Report so that the developer can always see that it is in watch mode as the latest console line.
      terminal.writeLine(
        `Watching for changes to ${projectsToWatch.size} ${
          projectsToWatch.size === 1 ? 'project' : 'projects'
        }. Press Ctrl+C to exit.`
      );
    };

    // Loop until Ctrl+C
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // On the initial invocation, this promise will return immediately with the full set of projects
      const { changedProjects, state } = await projectWatcher.waitForChange(onWaitingForChanges);

      if (stopwatch.state === StopwatchState.Stopped) {
        // Clear and reset the stopwatch so that we only report time from a single execution at a time
        stopwatch.reset();
        stopwatch.start();
      }

      terminal.writeLine(
        `Detected changes in ${changedProjects.size} project${changedProjects.size === 1 ? '' : 's'}:`
      );
      const names: string[] = [...changedProjects].map((x) => x.packageName).sort();
      for (const name of names) {
        terminal.writeLine(`    ${colors.cyan(name)}`);
      }

      // Account for consumer relationships
      const createOperationsContext: ICreateOperationsContext = {
        ...initialCreateOperationsContext,
        isInitial: false,
        projectChangeAnalyzer: state,
        projectsInUnknownState: changedProjects,
        phaseOriginal,
        phaseSelection
      };

      const operations: Set<Operation> = await this.hooks.createOperations.promise(
        new Set(),
        createOperationsContext
      );

      const executeOptions: IExecutionOperationsOptions = {
        createOperationsContext,
        // For now, don't run pre-build or post-build in watch mode
        ignoreHooks: true,
        operations,
        stopwatch,
        executionManagerOptions,
        terminal
      };

      try {
        // Delegate the the underlying command, for only the projects that need reprocessing
        await this._executeOperations(executeOptions);
      } catch (err) {
        // In watch mode, we want to rebuild even if the original build failed.
        if (!(err instanceof AlreadyReportedError)) {
          throw err;
        }
      }
    }
  }

  /**
   * Runs a set of operations and reports the results.
   */
  private async _executeOperations(options: IExecutionOperationsOptions): Promise<void> {
    const { executionManagerOptions, ignoreHooks, operations, stopwatch, terminal } = options;

    const executionManager: OperationExecutionManager = new OperationExecutionManager(
      operations,
      executionManagerOptions
    );

    const { isInitial, isWatch } = options.createOperationsContext;

    let success: boolean = false;
    let result: IExecutionResult | undefined;

    try {
      result = await executionManager.executeAsync();
      success = result.status === OperationStatus.Success;

      await this.hooks.afterExecuteOperations.promise(result, options.createOperationsContext);

      stopwatch.stop();

      const message: string = `rush ${this.actionName} (${stopwatch.toString()})`;
      if (result.status === OperationStatus.Success) {
        terminal.writeLine(colors.green(message));
      } else {
        terminal.writeLine(message);
      }
    } catch (error) {
      success = false;
      stopwatch.stop();

      if (error instanceof AlreadyReportedError) {
        terminal.writeLine(`rush ${this.actionName} (${stopwatch.toString()})`);
      } else {
        if (error && (error as Error).message) {
          if (this.parser.isDebug) {
            terminal.writeErrorLine('Error: ' + (error as Error).stack);
          } else {
            terminal.writeErrorLine('Error: ' + (error as Error).message);
          }
        }

        terminal.writeErrorLine(colors.red(`rush ${this.actionName} - Errors! (${stopwatch.toString()})`));
      }
    }

    if (!ignoreHooks) {
      this._doAfterTask();
    }

    if (this.parser.telemetry) {
      const operationResults: Record<string, ITelemetryOperationResult> = {};

      const extraData: IPhasedCommandTelemetry = {
        // Fields preserved across the command invocation
        ...this._selectionParameters.getTelemetry(),
        ...this.getParameterStringMap(),
        isWatch,
        // Fields specific to the current operation set
        isInitial,

        countAll: 0,
        countSuccess: 0,
        countSuccessWithWarnings: 0,
        countFailure: 0,
        countBlocked: 0,
        countFromCache: 0,
        countSkipped: 0,
        countNoOp: 0
      };

      if (result) {
        const nonSilentDependenciesByOperation: Map<Operation, Set<string>> = new Map();
        function getNonSilentDependencies(operation: Operation): ReadonlySet<string> {
          let realDependencies: Set<string> | undefined = nonSilentDependenciesByOperation.get(operation);
          if (!realDependencies) {
            realDependencies = new Set();
            nonSilentDependenciesByOperation.set(operation, realDependencies);
            for (const dependency of operation.dependencies) {
              if (dependency.runner!.silent) {
                for (const deepDependency of getNonSilentDependencies(dependency)) {
                  realDependencies.add(deepDependency);
                }
              } else {
                realDependencies.add(dependency.name!);
              }
            }
          }
          return realDependencies;
        }

        for (const [operation, operationResult] of result.operationResults) {
          if (operation.runner?.silent) {
            // Architectural operation. Ignore.
            continue;
          }

          const { startTime, endTime } = operationResult.stopwatch;
          operationResults[operation.name!] = {
            startTimestampMs: startTime,
            endTimestampMs: endTime,
            nonCachedDurationMs: operationResult.nonCachedDurationMs,
            result: operationResult.status,
            dependencies: Array.from(getNonSilentDependencies(operation)).sort()
          };

          extraData.countAll++;
          switch (operationResult.status) {
            case OperationStatus.Success:
              extraData.countSuccess++;
              break;
            case OperationStatus.SuccessWithWarning:
              extraData.countSuccessWithWarnings++;
              break;
            case OperationStatus.Failure:
              extraData.countFailure++;
              break;
            case OperationStatus.Blocked:
              extraData.countBlocked++;
              break;
            case OperationStatus.FromCache:
              extraData.countFromCache++;
              break;
            case OperationStatus.Skipped:
              extraData.countSkipped++;
              break;
            case OperationStatus.NoOp:
              extraData.countNoOp++;
              break;
            default:
              // Do nothing.
              break;
          }
        }
      }

      const logEntry: ITelemetryData = {
        name: this.actionName,
        durationInSeconds: stopwatch.duration,
        result: success ? 'Succeeded' : 'Failed',
        extraData,
        operationResults
      };

      this.hooks.beforeLog.call(logEntry);

      this.parser.telemetry.log(logEntry);

      this.parser.flushTelemetry();
    }

    if (!success && !isWatch) {
      throw new AlreadyReportedError();
    }
  }

  private _doBeforeTask(): void {
    if (
      this.actionName !== RushConstants.buildCommandName &&
      this.actionName !== RushConstants.rebuildCommandName
    ) {
      // Only collects information for built-in commands like build or rebuild.
      return;
    }

    SetupChecks.validate(this.rushConfiguration);

    this.eventHooksManager.handle(Event.preRushBuild, this.parser.isDebug, this._ignoreHooksParameter.value);
  }

  private _doAfterTask(): void {
    if (
      this.actionName !== RushConstants.buildCommandName &&
      this.actionName !== RushConstants.rebuildCommandName
    ) {
      // Only collects information for built-in commands like build or rebuild.
      return;
    }
    this.eventHooksManager.handle(Event.postRushBuild, this.parser.isDebug, this._ignoreHooksParameter.value);
  }
}
