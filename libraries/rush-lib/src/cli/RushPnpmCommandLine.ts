// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ILaunchOptions } from '../api/Rush';
import { RushPnpmCommandLineParser } from './RushPnpmCommandLineParser';

export interface ILaunchRushPnpmInternalOptions extends ILaunchOptions {}

export class RushPnpmCommandLine {
  public static launch(launcherVersion: string, options: ILaunchRushPnpmInternalOptions): void {
    RushPnpmCommandLineParser.initializeAsync(options)
      // RushPnpmCommandLineParser.executeAsync should never reject the promise
      .then((rushPnpmCommandLineParser) => rushPnpmCommandLineParser.executeAsync())
      .catch(console.error);
  }
}
