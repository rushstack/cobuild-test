// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Async, InternalError } from '@rushstack/node-core-library';

import { Constants } from '../utilities/Constants';
import { HeftLifecycle } from './HeftLifecycle';
import { HeftPhaseSession } from './HeftPhaseSession';
import { HeftPhase } from './HeftPhase';
import {
  CoreConfigFiles,
  type IHeftConfigurationJson,
  type IHeftConfigurationJsonActionReference
} from '../utilities/CoreConfigFiles';
import type { MetricsCollector } from '../metrics/MetricsCollector';
import type { LoggingManager } from './logging/LoggingManager';
import type { HeftConfiguration } from '../configuration/HeftConfiguration';
import type { HeftTask } from './HeftTask';
import type { HeftParameterManager } from './HeftParameterManager';
import type { IHeftParsedCommandLine } from './HeftTaskSession';

export interface IInternalHeftSessionOptions {
  heftConfiguration: HeftConfiguration;
  loggingManager: LoggingManager;
  metricsCollector: MetricsCollector;

  debug: boolean;
}

function* getAllTasks(phases: Iterable<HeftPhase>): Iterable<HeftTask> {
  for (const phase of phases) {
    yield* phase.tasks;
  }
}

export class InternalHeftSession {
  private readonly _phaseSessionsByPhase: Map<HeftPhase, HeftPhaseSession> = new Map();
  private readonly _heftConfigurationJson: IHeftConfigurationJson;
  private _actionReferencesByAlias: ReadonlyMap<string, IHeftConfigurationJsonActionReference> | undefined;
  private _lifecycle: HeftLifecycle | undefined;
  private _phases: Set<HeftPhase> | undefined;
  private _phasesByName: Map<string, HeftPhase> | undefined;
  private _parameterManager: HeftParameterManager | undefined;

  public readonly heftConfiguration: HeftConfiguration;

  public readonly loggingManager: LoggingManager;

  public readonly metricsCollector: MetricsCollector;

  public parsedCommandLine: IHeftParsedCommandLine | undefined;

  public readonly debug: boolean;

  private constructor(heftConfigurationJson: IHeftConfigurationJson, options: IInternalHeftSessionOptions) {
    this.heftConfiguration = options.heftConfiguration;
    this.loggingManager = options.loggingManager;
    this.metricsCollector = options.metricsCollector;
    this.debug = options.debug;
    this._heftConfigurationJson = heftConfigurationJson;
  }

  public static async initializeAsync(options: IInternalHeftSessionOptions): Promise<InternalHeftSession> {
    // Initialize the rig. Must be done before the HeftConfiguration.rigConfig is used.
    await options.heftConfiguration._checkForRigAsync();

    const heftConfigurationJson: IHeftConfigurationJson =
      await CoreConfigFiles.loadHeftConfigurationFileForProjectAsync(
        options.heftConfiguration.globalTerminal,
        options.heftConfiguration.buildFolderPath,
        options.heftConfiguration.rigConfig
      );

    const internalHeftSession: InternalHeftSession = new InternalHeftSession(heftConfigurationJson, options);

    // Initialize the lifecycle and the tasks. This will ensure that we throw an error if a plugin is improperly
    // specified, or if the options provided to a plugin are invalid. We will avoid loading the actual plugins
    // until they are needed.
    await internalHeftSession.lifecycle.ensureInitializedAsync();
    const tasks: Iterable<HeftTask> = getAllTasks(internalHeftSession.phases);
    await Async.forEachAsync(
      tasks,
      async (task: HeftTask) => {
        await task.ensureInitializedAsync();
      },
      { concurrency: Constants.maxParallelism }
    );

    return internalHeftSession;
  }

  public get parameterManager(): HeftParameterManager {
    if (!this._parameterManager) {
      throw new InternalError('A parameter manager for the session has not been provided.');
    }
    return this._parameterManager;
  }

  public set parameterManager(value: HeftParameterManager) {
    this._parameterManager = value;
  }

  public get actionReferencesByAlias(): ReadonlyMap<string, IHeftConfigurationJsonActionReference> {
    if (!this._actionReferencesByAlias) {
      this._actionReferencesByAlias = new Map(
        Object.entries(this._heftConfigurationJson.aliasesByName || {})
      );
    }
    return this._actionReferencesByAlias;
  }

  public get lifecycle(): HeftLifecycle {
    if (!this._lifecycle) {
      this._lifecycle = new HeftLifecycle(this, this._heftConfigurationJson.heftPlugins || []);
    }
    return this._lifecycle;
  }

  public get phases(): ReadonlySet<HeftPhase> {
    this._ensurePhases();
    return this._phases!;
  }

  public get phasesByName(): ReadonlyMap<string, HeftPhase> {
    this._ensurePhases();
    return this._phasesByName!;
  }

  public getSessionForPhase(phase: HeftPhase): HeftPhaseSession {
    let phaseSession: HeftPhaseSession | undefined = this._phaseSessionsByPhase.get(phase);
    if (!phaseSession) {
      phaseSession = new HeftPhaseSession({ internalHeftSession: this, phase });
      this._phaseSessionsByPhase.set(phase, phaseSession);
    }
    return phaseSession;
  }

  private _ensurePhases(): void {
    if (!this._phases || !this._phasesByName) {
      this._phasesByName = new Map();
      for (const [phaseName, phaseSpecifier] of Object.entries(
        this._heftConfigurationJson.phasesByName || {}
      )) {
        const phase: HeftPhase = new HeftPhase(this, phaseName, phaseSpecifier);
        this._phasesByName.set(phaseName, phase);
      }
      this._phases = new Set(this._phasesByName.values());
    }
  }
}
