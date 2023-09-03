// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Prefix to wrap `function (module, __webpack_exports__, __webpack_require__) { ... }` so that the minifier doesn't delete it.
 * Public because alternate Minifier implementations may wish to know about it.
 * @public
 */
export const MODULE_WRAPPER_PREFIX: '__MINIFY_MODULE__(' = '__MINIFY_MODULE__(';
/**
 * Suffix to wrap `function (module, __webpack_exports__, __webpack_require__) { ... }` so that the minifier doesn't delete it.
 * Public because alternate Minifier implementations may wish to know about it.
 * @public
 */
export const MODULE_WRAPPER_SUFFIX: ');' = ');';

/**
 * Token preceding a module id in the emitted asset so the minifier can operate on the Webpack runtime or chunk boilerplate in isolation
 * @public
 */
export const CHUNK_MODULE_TOKEN: '__WEBPACK_CHUNK_MODULE__' = '__WEBPACK_CHUNK_MODULE__';

/**
 * RegExp for replacing chunk module placeholders
 * @public
 */
export const CHUNK_MODULE_REGEX: RegExp = /__WEBPACK_CHUNK_MODULE__([A-Za-z0-9$_]+)/g;

/**
 * Stage # to use when this should be the first tap in the hook
 * @public
 */
export const STAGE_BEFORE: -10000 = -10000;
/**
 * Stage # to use when this should be the last tap in the hook
 * @public
 */
export const STAGE_AFTER: 100 = 100;
