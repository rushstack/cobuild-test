// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Callback used by {@link LegacyAdapters}.
 * @public
 */
// eslint-disable-next-line @rushstack/no-new-null
export type LegacyCallback<TResult, TError> = (error: TError | null | undefined, result: TResult) => void;

/**
 * Helper functions used when interacting with APIs that do not follow modern coding practices.
 * @public
 */
export class LegacyAdapters {
  /**
   * This function wraps a function with a callback in a promise.
   */
  public static convertCallbackToPromise<TResult, TError>(
    fn: (cb: LegacyCallback<TResult, TError>) => void
  ): Promise<TResult>;
  public static convertCallbackToPromise<TResult, TError, TArg1>(
    fn: (arg1: TArg1, cb: LegacyCallback<TResult, TError>) => void,
    arg1: TArg1
  ): Promise<TResult>;
  public static convertCallbackToPromise<TResult, TError, TArg1, TArg2>(
    fn: (arg1: TArg1, arg2: TArg2, cb: LegacyCallback<TResult, TError>) => void,
    arg1: TArg1,
    arg2: TArg2
  ): Promise<TResult>;
  public static convertCallbackToPromise<TResult, TError, TArg1, TArg2, TArg3>(
    fn: (arg1: TArg1, arg2: TArg2, arg3: TArg3, cb: LegacyCallback<TResult, TError>) => void,
    arg1: TArg1,
    arg2: TArg2,
    arg3: TArg3
  ): Promise<TResult>;
  public static convertCallbackToPromise<TResult, TError, TArg1, TArg2, TArg3, TArg4>(
    fn: (arg1: TArg1, arg2: TArg2, arg3: TArg3, arg4: TArg4, cb: LegacyCallback<TResult, TError>) => void,
    arg1: TArg1,
    arg2: TArg2,
    arg3: TArg3,
    arg4: TArg4
  ): Promise<TResult>;
  public static convertCallbackToPromise<TResult, TError, TArg1, TArg2, TArg3, TArg4>(
    fn: (
      a: TArg1 | LegacyCallback<TResult, TError>,
      b?: TArg2 | LegacyCallback<TResult, TError>,
      c?: TArg3 | LegacyCallback<TResult, TError>,
      d?: TArg4 | LegacyCallback<TResult, TError>,
      e?: TArg4 | LegacyCallback<TResult, TError>
    ) => void,
    arg1?: TArg1,
    arg2?: TArg2,
    arg3?: TArg3,
    arg4?: TArg4
  ): Promise<TResult> {
    return new Promise((resolve: (result: TResult) => void, reject: (error: Error) => void) => {
      const cb: LegacyCallback<TResult, TError> = (error: TError | null | undefined, result: TResult) => {
        if (error) {
          reject(LegacyAdapters.scrubError(error));
        } else {
          resolve(result);
        }
      };

      try {
        if (arg1 !== undefined && arg2 !== undefined && arg3 !== undefined && arg4 !== undefined) {
          fn(arg1, arg2, arg3, arg4, cb);
        } else if (arg1 !== undefined && arg2 !== undefined && arg3 !== undefined) {
          fn(arg1, arg2, arg3, cb);
        } else if (arg1 !== undefined && arg2 !== undefined) {
          fn(arg1, arg2, cb);
        } else if (arg1 !== undefined) {
          fn(arg1, cb);
        } else {
          fn(cb);
        }
      } catch (e) {
        reject(e as Error);
      }
    });
  }

  /**
   * Normalizes an object into an `Error` object.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static scrubError(error: Error | string | any): Error {
    if (error instanceof Error) {
      return error;
    } else if (typeof error === 'string') {
      return new Error(error);
    } else {
      const errorObject: Error = new Error('An error occurred.');
      (errorObject as any).errorData = error; // eslint-disable-line @typescript-eslint/no-explicit-any
      return errorObject;
    }
  }

  /**
   * Prior to Node 11.x, the `Array.sort()` algorithm is not guaranteed to be stable.
   * If you need a stable sort, you can use `sortStable()` as a workaround.
   *
   * @deprecated
   * Use native Array.sort(), since Node &lt; 14 is no longer supported
   * @remarks
   * On NodeJS 11.x and later, this method simply calls the native `Array.sort()`.
   */
  public static sortStable<T>(array: T[], compare?: (a: T, b: T) => number): void {
    Array.prototype.sort.call(array, compare);
  }
}
