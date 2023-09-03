// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { InternalError } from '@rushstack/node-core-library';

import type { CobuildConfiguration } from '../../api/CobuildConfiguration';
import type { OperationStatus } from '../operations/OperationStatus';
import type { ICobuildContext } from './ICobuildLockProvider';
import type { ProjectBuildCache } from '../buildCache/ProjectBuildCache';

const KEY_SEPARATOR: ':' = ':';

export interface ICobuildLockOptions {
  /**
   * {@inheritdoc CobuildConfiguration}
   */
  cobuildConfiguration: CobuildConfiguration;
  /**
   * {@inheritdoc ICobuildContext.clusterId}
   */
  cobuildClusterId: string;
  /**
   * {@inheritdoc ICobuildContext.packageName}
   */
  packageName: string;
  /**
   * {@inheritdoc ICobuildContext.phaseName}
   */
  phaseName: string;
  projectBuildCache: ProjectBuildCache;
  /**
   * The expire time of the lock in seconds.
   */
  lockExpireTimeInSeconds: number;
}

export interface ICobuildCompletedState {
  status: OperationStatus.Success | OperationStatus.SuccessWithWarning | OperationStatus.Failure;
  cacheId: string;
}

export class CobuildLock {
  public readonly cobuildConfiguration: CobuildConfiguration;
  public readonly projectBuildCache: ProjectBuildCache;

  private _cobuildContext: ICobuildContext;

  public constructor(options: ICobuildLockOptions) {
    const {
      cobuildConfiguration,
      projectBuildCache,
      cobuildClusterId: clusterId,
      lockExpireTimeInSeconds,
      packageName,
      phaseName
    } = options;
    const { cobuildContextId: contextId, cobuildRunnerId: runnerId } = cobuildConfiguration;
    const { cacheId } = projectBuildCache;
    this.cobuildConfiguration = cobuildConfiguration;
    this.projectBuildCache = projectBuildCache;

    if (!cacheId) {
      // This should never happen
      throw new InternalError(`Cache id is require for cobuild lock`);
    }

    if (!contextId) {
      // This should never happen
      throw new InternalError(`Cobuild context id is require for cobuild lock`);
    }

    // Example: cobuild:lock:<contextId>:<clusterId>
    const lockKey: string = ['cobuild', 'lock', contextId, clusterId].join(KEY_SEPARATOR);

    // Example: cobuild:completed:<contextId>:<cacheId>
    const completedStateKey: string = ['cobuild', 'completed', contextId, cacheId].join(KEY_SEPARATOR);

    this._cobuildContext = {
      contextId,
      clusterId,
      runnerId,
      lockKey,
      completedStateKey,
      packageName,
      phaseName,
      lockExpireTimeInSeconds: lockExpireTimeInSeconds,
      cacheId
    };
  }

  public async setCompletedStateAsync(state: ICobuildCompletedState): Promise<void> {
    await this.cobuildConfiguration.cobuildLockProvider.setCompletedStateAsync(this._cobuildContext, state);
  }

  public async getCompletedStateAsync(): Promise<ICobuildCompletedState | undefined> {
    const state: ICobuildCompletedState | undefined =
      await this.cobuildConfiguration.cobuildLockProvider.getCompletedStateAsync(this._cobuildContext);
    return state;
  }

  public async tryAcquireLockAsync(): Promise<boolean> {
    const acquireLockResult: boolean = await this.cobuildConfiguration.cobuildLockProvider.acquireLockAsync(
      this._cobuildContext
    );
    if (acquireLockResult) {
      // renew the lock in a redundant way in case of losing the lock
      await this.renewLockAsync();
    }
    return acquireLockResult;
  }

  public async renewLockAsync(): Promise<void> {
    await this.cobuildConfiguration.cobuildLockProvider.renewLockAsync(this._cobuildContext);
  }

  public get cobuildContext(): ICobuildContext {
    return this._cobuildContext;
  }
}
