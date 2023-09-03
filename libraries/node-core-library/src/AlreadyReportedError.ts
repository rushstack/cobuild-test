// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TypeUuid } from './TypeUuid';

const uuidAlreadyReportedError: string = 'f26b0640-a49b-49d1-9ead-1a516d5920c7';

/**
 * This exception can be thrown to indicate that an operation failed and an error message has already
 * been reported appropriately. Thus, the catch handler does not have responsibility for reporting
 * the error.
 *
 * @remarks
 * For example, suppose a tool writes interactive output to `console.log()`.  When an exception is thrown,
 * the `catch` handler will typically provide simplistic reporting such as this:
 *
 * ```ts
 * catch (error) {
 *   console.log("ERROR: " + error.message);
 * }
 * ```
 *
 * Suppose that the code performing the operation normally prints rich output to the console.  It may be able to
 * present an error message more nicely (for example, as part of a table, or structured log format).  Throwing
 * `AlreadyReportedError` provides a way to use exception handling to abort the operation, but instruct the `catch`
 * handler not to print an error a second time:
 *
 * ```ts
 * catch (error) {
 *   if (error instanceof AlreadyReportedError) {
 *     return;
 *   }
 *   console.log("ERROR: " + error.message);
 * }
 * ```
 *
 * @public
 */
export class AlreadyReportedError extends Error {
  public constructor() {
    super('An error occurred.');

    // Manually set the prototype, as we can no longer extend built-in classes like Error, Array, Map, etc
    // [https://github.com/microsoft/TypeScript-wiki/blob/main/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work](https://github.com/microsoft/TypeScript-wiki/blob/main/Breaking-Changes.md#extending-built-ins-like-error-array-and-map-may-no-longer-work)
    //
    // Note: the prototype must also be set on any classes which extend this one
    (this as any).__proto__ = AlreadyReportedError.prototype; // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  public static [Symbol.hasInstance](instance: object): boolean {
    return TypeUuid.isInstanceOf(instance, uuidAlreadyReportedError);
  }
}

TypeUuid.registerClass(AlreadyReportedError, uuidAlreadyReportedError);
