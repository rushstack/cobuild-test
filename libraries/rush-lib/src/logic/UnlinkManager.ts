// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import colors from 'colors/safe';
import * as path from 'path';
import { FileSystem, AlreadyReportedError } from '@rushstack/node-core-library';

import { RushConfiguration } from '../api/RushConfiguration';
import { Utilities } from '../utilities/Utilities';
import { BaseProjectShrinkwrapFile } from './base/BaseProjectShrinkwrapFile';
import { LastLinkFlagFactory } from '../api/LastLinkFlag';

/**
 * This class implements the logic for "rush unlink"
 */
export class UnlinkManager {
  private _rushConfiguration: RushConfiguration;

  public constructor(rushConfiguration: RushConfiguration) {
    this._rushConfiguration = rushConfiguration;
  }

  /**
   * Delete flag file and all the existing node_modules symlinks and all
   * project/.rush/temp/shrinkwrap-deps.json files
   *
   * Returns true if anything was deleted.
   */
  public unlink(force: boolean = false): boolean {
    const useWorkspaces: boolean =
      this._rushConfiguration.pnpmOptions && this._rushConfiguration.pnpmOptions.useWorkspaces;
    if (!force && useWorkspaces) {
      console.log(
        colors.red(
          'Unlinking is not supported when using workspaces. Run "rush purge" to remove ' +
            'project node_modules folders.'
        )
      );
      throw new AlreadyReportedError();
    }

    LastLinkFlagFactory.getCommonTempFlag(this._rushConfiguration).clear();
    return this._deleteProjectFiles();
  }

  /**
   * Delete:
   *  - all the node_modules symlinks of configured Rush projects
   *  - all of the project/.rush/temp/shrinkwrap-deps.json files of configured Rush projects
   *
   * Returns true if anything was deleted
   * */
  private _deleteProjectFiles(): boolean {
    let didDeleteAnything: boolean = false;

    for (const rushProject of this._rushConfiguration.projects) {
      const localModuleFolder: string = path.join(rushProject.projectFolder, 'node_modules');
      if (FileSystem.exists(localModuleFolder)) {
        console.log(`Purging ${localModuleFolder}`);
        Utilities.dangerouslyDeletePath(localModuleFolder);
        didDeleteAnything = true;
      }

      const projectShrinkwrapFilePath: string = BaseProjectShrinkwrapFile.getFilePathForProject(rushProject);
      if (FileSystem.exists(projectShrinkwrapFilePath)) {
        console.log(`Deleting ${projectShrinkwrapFilePath}`);
        FileSystem.deleteFile(projectShrinkwrapFilePath);
        didDeleteAnything = true;
      }
    }

    return didDeleteAnything;
  }
}
