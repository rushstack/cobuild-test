## API Report File for "@rushstack/webpack-deep-imports-plugin"

> Do not edit this file. It is a report generated by [API Extractor](https://api-extractor.com/).

```ts

import { Compiler } from 'webpack';
import { DllPlugin } from 'webpack';

// @public
export class DeepImportsPlugin extends DllPlugin {
    constructor(options: IDeepImportsPluginOptions);
    // (undocumented)
    apply(compiler: Compiler): void;
}

// Warning: (ae-forgotten-export) The symbol "DllPluginOptions" needs to be exported by the entry point index.d.ts
//
// @public (undocumented)
export interface IDeepImportsPluginOptions extends DllPluginOptions {
    dTsFilesInputFolderName?: string;
    inFolderName: string;
    outFolderName: string;
    pathsToIgnore?: string[];
}

// (No @packageDocumentation comment for this package)

```
