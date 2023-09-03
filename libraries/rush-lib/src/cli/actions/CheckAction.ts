// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import colors from 'colors/safe';
import { CommandLineStringParameter, CommandLineFlagParameter } from '@rushstack/ts-command-line';

import { RushCommandLineParser } from '../RushCommandLineParser';
import { BaseRushAction } from './BaseRushAction';
import { VersionMismatchFinder } from '../../logic/versionMismatch/VersionMismatchFinder';
import { Variants } from '../../api/Variants';
import { ConsoleTerminalProvider, ITerminal, Terminal } from '@rushstack/node-core-library';

export class CheckAction extends BaseRushAction {
  private readonly _terminal: ITerminal;
  private readonly _variant: CommandLineStringParameter;
  private readonly _jsonFlag: CommandLineFlagParameter;
  private readonly _verboseFlag: CommandLineFlagParameter;

  public constructor(parser: RushCommandLineParser) {
    super({
      actionName: 'check',
      summary:
        "Checks each project's package.json files and ensures that all dependencies are of the same " +
        'version throughout the repository.',
      documentation:
        "Checks each project's package.json files and ensures that all dependencies are of the " +
        'same version throughout the repository.',
      safeForSimultaneousRushProcesses: true,
      parser
    });

    this._terminal = new Terminal(new ConsoleTerminalProvider({ verboseEnabled: parser.isDebug }));
    this._variant = this.defineStringParameter(Variants.VARIANT_PARAMETER);
    this._jsonFlag = this.defineFlagParameter({
      parameterLongName: '--json',
      description: 'If this flag is specified, output will be in JSON format.'
    });
    this._verboseFlag = this.defineFlagParameter({
      parameterLongName: '--verbose',
      description:
        'If this flag is specified, long lists of package names will not be truncated. ' +
        `This has no effect if the ${this._jsonFlag.longName} flag is also specified.`
    });
  }

  protected async runAsync(): Promise<void> {
    const variant: string | undefined = this.rushConfiguration.currentInstalledVariant;

    if (!this._variant.value && variant) {
      console.log(
        colors.yellow(
          `Variant '${variant}' has been installed, but 'rush check' is currently checking the default variant. ` +
            `Use 'rush check --variant '${variant}' to check the current installation.`
        )
      );
    }

    VersionMismatchFinder.rushCheck(this.rushConfiguration, this._terminal, {
      variant: this._variant.value,
      printAsJson: this._jsonFlag.value,
      truncateLongPackageNameLists: !this._verboseFlag.value
    });
  }
}
