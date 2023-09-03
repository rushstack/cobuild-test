// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as argparse from 'argparse';

import { CommandLineParameterProvider, ICommandLineParserData } from './CommandLineParameterProvider';
import type { ICommandLineParserOptions } from './CommandLineParser';

/**
 * Options for the CommandLineAction constructor.
 * @public
 */
export interface ICommandLineActionOptions {
  /**
   * The name of the action.  For example, if the tool is called "example",
   * then the "build" action might be invoked as: "example build -q --some-other-option"
   */
  actionName: string;

  /**
   * A quick summary that is shown on the main help page, which is displayed
   * by the command "example --help"
   */
  summary: string;

  /**
   * A detailed description that is shown on the action help page, which is displayed
   * by the command "example build --help", e.g. for actionName="build".
   */
  documentation: string;
}

/**
 * Example: "do-something"
 */
const ACTION_NAME_REGEXP: RegExp = /^[a-z][a-z0-9]*([-:][a-z0-9]+)*$/;

/**
 * Represents a sub-command that is part of the CommandLineParser command line.
 * Applications should create subclasses of CommandLineAction corresponding to
 * each action that they want to expose.
 *
 * The action name should be comprised of lower case words separated by hyphens
 * or colons. The name should include an English verb (e.g. "deploy"). Use a
 * hyphen to separate words (e.g. "upload-docs"). A group of related commands
 * can be prefixed with a colon (e.g. "docs:generate", "docs:deploy",
 * "docs:serve", etc).
 *
 * @public
 */
export abstract class CommandLineAction extends CommandLineParameterProvider {
  /** {@inheritDoc ICommandLineActionOptions.actionName} */
  public readonly actionName: string;

  /** {@inheritDoc ICommandLineActionOptions.summary} */
  public readonly summary: string;

  /** {@inheritDoc ICommandLineActionOptions.documentation} */
  public readonly documentation: string;

  private _argumentParser: argparse.ArgumentParser | undefined;

  public constructor(options: ICommandLineActionOptions) {
    super();

    if (!ACTION_NAME_REGEXP.test(options.actionName)) {
      throw new Error(
        `Invalid action name "${options.actionName}". ` +
          `The name must be comprised of lower-case words optionally separated by hyphens or colons.`
      );
    }

    this.actionName = options.actionName;
    this.summary = options.summary;
    this.documentation = options.documentation;

    this._argumentParser = undefined;
  }

  /**
   * This is called internally by CommandLineParser.addAction()
   * @internal
   */
  public _buildParser(actionsSubParser: argparse.SubParser): void {
    this._argumentParser = actionsSubParser.addParser(this.actionName, {
      help: this.summary,
      description: this.documentation
    });

    this.onDefineParameters?.();
  }

  /**
   * This is called internally by CommandLineParser.execute()
   * @internal
   */
  public _processParsedData(parserOptions: ICommandLineParserOptions, data: ICommandLineParserData): void {
    super._processParsedData(parserOptions, data);
  }

  /**
   * Invoked by CommandLineParser.onExecute().
   * @internal
   */
  public _execute(): Promise<void> {
    return this.onExecute();
  }

  /**
   * {@inheritDoc CommandLineParameterProvider._getArgumentParser}
   * @internal
   */
  protected _getArgumentParser(): argparse.ArgumentParser {
    // override
    if (!this._argumentParser) {
      // We will improve this in the future
      throw new Error('The CommandLineAction must be added to a CommandLineParser before it can be used');
    }

    return this._argumentParser;
  }

  /**
   * Your subclass should implement this hook to perform the operation.
   */
  protected abstract onExecute(): Promise<void>;
}
