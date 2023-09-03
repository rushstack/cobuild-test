// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Options for controlling the parallelism of asynchronous operations.
 *
 * @remarks
 * Used with {@link Async.mapAsync} and {@link Async.forEachAsync}.
 *
 * @beta
 */
export interface IAsyncParallelismOptions {
  /**
   * Optionally used with the  {@link Async.mapAsync} and {@link Async.forEachAsync}
   * to limit the maximum number of concurrent promises to the specified number.
   */
  concurrency?: number;
}

/**
 * @remarks
 * Used with {@link Async.runWithRetriesAsync}.
 *
 * @beta
 */
export interface IRunWithRetriesOptions<TResult> {
  action: () => Promise<TResult> | TResult;
  maxRetries: number;
  retryDelayMs?: number;
}

/**
 * Utilities for parallel asynchronous operations, for use with the system `Promise` APIs.
 *
 * @beta
 */
export class Async {
  /**
   * Given an input array and a `callback` function, invoke the callback to start a
   * promise for each element in the array.  Returns an array containing the results.
   *
   * @remarks
   * This API is similar to the system `Array#map`, except that the loop is asynchronous,
   * and the maximum number of concurrent promises can be throttled
   * using {@link IAsyncParallelismOptions.concurrency}.
   *
   * If `callback` throws a synchronous exception, or if it returns a promise that rejects,
   * then the loop stops immediately.  Any remaining array items will be skipped, and
   * overall operation will reject with the first error that was encountered.
   *
   * @param iterable - the array of inputs for the callback function
   * @param callback - a function that starts an asynchronous promise for an element
   *   from the array
   * @param options - options for customizing the control flow
   * @returns an array containing the result for each callback, in the same order
   *   as the original input `array`
   */
  public static async mapAsync<TEntry, TRetVal>(
    iterable: Iterable<TEntry> | AsyncIterable<TEntry>,
    callback: (entry: TEntry, arrayIndex: number) => Promise<TRetVal>,
    options?: IAsyncParallelismOptions | undefined
  ): Promise<TRetVal[]> {
    const result: TRetVal[] = [];

    await Async.forEachAsync(
      iterable,
      async (item: TEntry, arrayIndex: number): Promise<void> => {
        result[arrayIndex] = await callback(item, arrayIndex);
      },
      options
    );

    return result;
  }

  /**
   * Given an input array and a `callback` function, invoke the callback to start a
   * promise for each element in the array.
   *
   * @remarks
   * This API is similar to the system `Array#forEach`, except that the loop is asynchronous,
   * and the maximum number of concurrent promises can be throttled
   * using {@link IAsyncParallelismOptions.concurrency}.
   *
   * If `callback` throws a synchronous exception, or if it returns a promise that rejects,
   * then the loop stops immediately.  Any remaining array items will be skipped, and
   * overall operation will reject with the first error that was encountered.
   *
   * @param iterable - the array of inputs for the callback function
   * @param callback - a function that starts an asynchronous promise for an element
   *   from the array
   * @param options - options for customizing the control flow
   */
  public static async forEachAsync<TEntry>(
    iterable: Iterable<TEntry> | AsyncIterable<TEntry>,
    callback: (entry: TEntry, arrayIndex: number) => Promise<void>,
    options?: IAsyncParallelismOptions | undefined
  ): Promise<void> {
    await new Promise<void>((resolve: () => void, reject: (error: Error) => void) => {
      const concurrency: number =
        options?.concurrency && options.concurrency > 0 ? options.concurrency : Infinity;
      let operationsInProgress: number = 0;

      const iterator: Iterator<TEntry> | AsyncIterator<TEntry> = (
        (iterable as Iterable<TEntry>)[Symbol.iterator] ||
        (iterable as AsyncIterable<TEntry>)[Symbol.asyncIterator]
      ).call(iterable);

      let arrayIndex: number = 0;
      let iteratorIsComplete: boolean = false;
      let promiseHasResolvedOrRejected: boolean = false;

      async function queueOperationsAsync(): Promise<void> {
        while (operationsInProgress < concurrency && !iteratorIsComplete && !promiseHasResolvedOrRejected) {
          // Increment the concurrency while waiting for the iterator.
          // This function is reentrant, so this ensures that at most `concurrency` executions are waiting
          operationsInProgress++;
          const currentIteratorResult: IteratorResult<TEntry> = await iterator.next();
          // eslint-disable-next-line require-atomic-updates
          iteratorIsComplete = !!currentIteratorResult.done;

          if (!iteratorIsComplete) {
            Promise.resolve(callback(currentIteratorResult.value, arrayIndex++))
              .then(async () => {
                operationsInProgress--;
                await onOperationCompletionAsync();
              })
              .catch((error) => {
                promiseHasResolvedOrRejected = true;
                reject(error);
              });
          } else {
            // The iterator is complete and there wasn't a value, so untrack the waiting state.
            operationsInProgress--;
          }
        }

        if (iteratorIsComplete) {
          await onOperationCompletionAsync();
        }
      }

      async function onOperationCompletionAsync(): Promise<void> {
        if (!promiseHasResolvedOrRejected) {
          if (operationsInProgress === 0 && iteratorIsComplete) {
            promiseHasResolvedOrRejected = true;
            resolve();
          } else if (!iteratorIsComplete) {
            await queueOperationsAsync();
          }
        }
      }

      queueOperationsAsync().catch((error) => {
        promiseHasResolvedOrRejected = true;
        reject(error);
      });
    });
  }

  /**
   * Return a promise that resolves after the specified number of milliseconds.
   */
  public static async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Executes an async function and optionally retries it if it fails.
   */
  public static async runWithRetriesAsync<TResult>({
    action,
    maxRetries,
    retryDelayMs = 0
  }: IRunWithRetriesOptions<TResult>): Promise<TResult> {
    let retryCounter: number = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return await action();
      } catch (e) {
        if (++retryCounter > maxRetries) {
          throw e;
        } else if (retryDelayMs > 0) {
          await Async.sleep(retryDelayMs);
        }
      }
    }
  }
}

function getSignal(): [Promise<void>, () => void] {
  let resolver: () => void;
  const promise: Promise<void> = new Promise<void>((resolve) => {
    resolver = resolve;
  });
  return [promise, resolver!];
}

/**
 * A queue that allows for asynchronous iteration. During iteration, the queue will wait until
 * the next item is pushed into the queue before yielding. If instead all queue items are consumed
 * and all callbacks have been called, the queue will return.
 *
 * @public
 */
export class AsyncQueue<T> implements AsyncIterable<[T, () => void]> {
  private _queue: T[];
  private _onPushSignal: Promise<void>;
  private _onPushResolve: () => void;

  public constructor(iterable?: Iterable<T>) {
    this._queue = iterable ? Array.from(iterable) : [];
    const [promise, resolver] = getSignal();
    this._onPushSignal = promise;
    this._onPushResolve = resolver;
  }

  public async *[Symbol.asyncIterator](): AsyncIterableIterator<[T, () => void]> {
    let activeIterations: number = 0;
    let [callbackSignal, callbackResolve] = getSignal();
    const callback: () => void = () => {
      if (--activeIterations === 0) {
        // Resolve whatever the latest callback promise is and create a new one
        callbackResolve();
        const [newCallbackSignal, newCallbackResolve] = getSignal();
        callbackSignal = newCallbackSignal;
        callbackResolve = newCallbackResolve;
      }
    };

    let position: number = 0;
    while (this._queue.length > position || activeIterations > 0) {
      if (this._queue.length > position) {
        activeIterations++;
        yield [this._queue[position++], callback];
      } else {
        // On push, the item will be added to the queue and the onPushSignal will be resolved.
        // On calling the callback, active iterations will be decremented by the callback and the
        // callbackSignal will be resolved. This means that the loop will continue if there are
        // active iterations or if there are items in the queue that haven't been yielded yet.
        await Promise.race([this._onPushSignal, callbackSignal]);
      }
    }
  }

  /**
   * Adds an item to the queue.
   *
   * @param item - The item to push into the queue.
   */
  public push(item: T): void {
    this._queue.push(item);
    this._onPushResolve();
    const [onPushSignal, onPushResolve] = getSignal();
    this._onPushSignal = onPushSignal;
    this._onPushResolve = onPushResolve;
  }
}
