// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { LoaderContext, LoaderDefinitionFunction } from 'webpack';

import { Terminal, NewlineKind } from '@rushstack/node-core-library';
import { parseLocFile } from '@rushstack/localization-utilities';

import type { LocalizationPlugin } from '../LocalizationPlugin';
import { createLoader, IBaseLocLoaderOptions } from './LoaderFactory';
import { LoaderTerminalProvider } from '../utilities/LoaderTerminalProvider';

export interface ILocLoaderOptions extends IBaseLocLoaderOptions {
  pluginInstance: LocalizationPlugin;
  resxNewlineNormalization: NewlineKind | undefined;
  ignoreMissingResxComments: boolean | undefined;
}

/**
 * General purpose loader that dispatches based on file extension.
 */
const loader: LoaderDefinitionFunction<ILocLoaderOptions> = createLoader(
  (content: string, filePath: string, context: LoaderContext<ILocLoaderOptions>) => {
    const options: ILocLoaderOptions = context.getOptions();
    const terminal: Terminal = new Terminal(LoaderTerminalProvider.getTerminalProviderForLoader(context));

    return parseLocFile({
      ...options,
      terminal,
      content,
      filePath
    });
  }
);

export default loader;
