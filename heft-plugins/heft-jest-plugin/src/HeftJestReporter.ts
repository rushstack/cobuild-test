// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { ITerminal, Colors, InternalError, Text, IColorableSequence } from '@rushstack/node-core-library';
import {
  Reporter,
  Test,
  TestResult,
  AggregatedResult,
  TestContext,
  ReporterOnStartOptions,
  Config
} from '@jest/reporters';

import type { HeftConfiguration, IScopedLogger } from '@rushstack/heft';

export interface IHeftJestReporterOptions {
  heftConfiguration: HeftConfiguration;
  logger: IScopedLogger;
  debugMode: boolean;
}

/**
 * This custom reporter presents Jest test results using Heft's logging system.
 *
 * @privateRemarks
 * After making changes to this code, it's recommended to use `--debug-heft-reporter` to compare
 * with the output from Jest's default reporter, to check our output is consistent with typical
 * Jest behavior.
 *
 * For reference, Jest's default implementation is here:
 * https://github.com/facebook/jest/blob/main/packages/jest-reporters/src/default_reporter.ts
 */
export default class HeftJestReporter implements Reporter {
  private _terminal: ITerminal;
  private _buildFolderPath: string;
  private _debugMode: boolean;

  public constructor(jestConfig: Config.GlobalConfig, options: IHeftJestReporterOptions) {
    this._terminal = options.logger.terminal;
    this._buildFolderPath = options.heftConfiguration.buildFolderPath;
    this._debugMode = options.debugMode;
  }

  public async onTestStart(test: Test): Promise<void> {
    this._terminal.writeLine(
      Colors.whiteBackground(Colors.black('START')),
      ` ${this._getTestPath(test.path)}`
    );
  }

  public async onTestResult(
    test: Test,
    testResult: TestResult,
    aggregatedResult: AggregatedResult
  ): Promise<void> {
    this._writeConsoleOutput(testResult);
    const { numPassingTests, numFailingTests, failureMessage, testExecError, perfStats } = testResult;

    // Calculate the suite duration time from the test result. This is necessary because Jest doesn't
    // provide the duration on the 'test' object (at least not as of Jest 25), and other reporters
    // (ex. jest-junit) only use perfStats:
    // https://github.com/jest-community/jest-junit/blob/12da1a20217a9b6f30858013175319c1256f5b15/utils/buildJsonResults.js#L112
    const duration: string = perfStats ? `${((perfStats.end - perfStats.start) / 1000).toFixed(3)}s` : '?';
    const message: string =
      ` ${this._getTestPath(test.path)} ` +
      `(duration: ${duration}, ${numPassingTests} passed, ${numFailingTests} failed)`;

    if (numFailingTests > 0) {
      this._terminal.writeLine(Colors.redBackground(Colors.black('FAIL')), message);
    } else if (testExecError) {
      this._terminal.writeLine(Colors.redBackground(Colors.black(`FAIL (${testExecError.type})`)), message);
    } else {
      this._terminal.writeLine(Colors.greenBackground(Colors.black('PASS')), message);
    }

    if (failureMessage) {
      this._terminal.writeErrorLine(failureMessage);
    }

    if (testResult.snapshot.updated) {
      this._terminal.writeErrorLine(
        `Updated ${this._formatWithPlural(testResult.snapshot.updated, 'snapshot', 'snapshots')}`
      );
    }

    if (testResult.snapshot.added) {
      this._terminal.writeErrorLine(
        `Added ${this._formatWithPlural(testResult.snapshot.added, 'snapshot', 'snapshots')}`
      );
    }
  }

  // Tests often write messy console output.  For example, it may contain messages such as
  // "ERROR: Test successfully threw an exception!", which may confuse someone who is investigating
  // a build failure and searching its log output for errors.  To reduce confusion, we add a prefix
  // like "|console.error|" to each output line, to clearly distinguish test logging from regular
  // task output.  You can suppress test logging entirely using the "--silent" CLI parameter.
  private _writeConsoleOutput(testResult: TestResult): void {
    if (testResult.console) {
      for (const logEntry of testResult.console) {
        switch (logEntry.type) {
          case 'debug':
            this._writeConsoleOutputWithLabel('console.debug', logEntry.message);
            break;
          case 'log':
            this._writeConsoleOutputWithLabel('console.log', logEntry.message);
            break;
          case 'warn':
            this._writeConsoleOutputWithLabel('console.warn', logEntry.message);
            break;
          case 'error':
            this._writeConsoleOutputWithLabel('console.error', logEntry.message);
            break;
          case 'info':
            this._writeConsoleOutputWithLabel('console.info', logEntry.message);
            break;

          case 'groupCollapsed':
            if (this._debugMode) {
              // The "groupCollapsed" name is too long
              this._writeConsoleOutputWithLabel('collapsed', logEntry.message);
            }
            break;

          case 'assert':
          case 'count':
          case 'dir':
          case 'dirxml':
          case 'group':
          case 'time':
            if (this._debugMode) {
              this._writeConsoleOutputWithLabel(
                logEntry.type,
                `(${logEntry.type}) ${logEntry.message}`,
                true
              );
            }
            break;
          default:
            // Let's trap any new log types that get introduced in the future to make sure we handle
            // them correctly.
            throw new InternalError('Unimplemented Jest console log entry type: ' + logEntry.type);
        }
      }
    }
  }

  private _writeConsoleOutputWithLabel(label: string, message: string, debug?: boolean): void {
    if (message === '') {
      return;
    }
    const scrubbedMessage: string = Text.ensureTrailingNewline(Text.convertToLf(message));
    const lines: string[] = scrubbedMessage.split('\n').slice(0, -1);

    const PAD_LENGTH: number = 13; // "console.error" is the longest label

    const paddedLabel: string = '|' + label.padStart(PAD_LENGTH) + '|';
    const prefix: IColorableSequence = debug ? Colors.yellow(paddedLabel) : Colors.cyan(paddedLabel);

    for (const line of lines) {
      this._terminal.writeLine(prefix, ' ' + line);
    }
  }

  public async onRunStart(
    aggregatedResult: AggregatedResult,
    options: ReporterOnStartOptions
  ): Promise<void> {
    // Jest prints some text that changes the console's color without a newline, so we reset the console's color here
    // and print a newline.
    this._terminal.writeLine('\u001b[0m');
    this._terminal.writeLine(
      `Run start. ${this._formatWithPlural(aggregatedResult.numTotalTestSuites, 'test suite', 'test suites')}`
    );
  }

  public async onRunComplete(contexts: Set<TestContext>, results: AggregatedResult): Promise<void> {
    const { numPassedTests, numFailedTests, numTotalTests, numRuntimeErrorTestSuites } = results;

    this._terminal.writeLine();
    this._terminal.writeLine('Tests finished:');

    const successesText: string = `  Successes: ${numPassedTests}`;
    this._terminal.writeLine(numPassedTests > 0 ? Colors.green(successesText) : successesText);

    const failText: string = `  Failures: ${numFailedTests}`;
    this._terminal.writeLine(numFailedTests > 0 ? Colors.red(failText) : failText);

    if (numRuntimeErrorTestSuites) {
      this._terminal.writeLine(Colors.red(`  Failed test suites: ${numRuntimeErrorTestSuites}`));
    }

    this._terminal.writeLine(`  Total: ${numTotalTests}`);
  }

  public getLastError(): void {
    // This reporter doesn't have any errors to throw
  }

  private _getTestPath(fullTestPath: string): string {
    return path.relative(this._buildFolderPath, fullTestPath);
  }

  private _formatWithPlural(num: number, singular: string, plural: string): string {
    return `${num} ${num === 1 ? singular : plural}`;
  }
}
