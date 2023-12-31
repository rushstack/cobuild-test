## API Report File for "@rushstack/webpack-embedded-dependencies-plugin"

> Do not edit this file. It is a report generated by [API Extractor](https://api-extractor.com/).

```ts

import type { Compiler } from 'webpack';
import type { IPackageJson } from '@rushstack/node-core-library';
import type { WebpackPluginInstance } from 'webpack';

// @beta
class EmbeddedDependenciesWebpackPlugin implements WebpackPluginInstance {
    constructor(options?: IEmbeddedDependenciesWebpackPluginOptions);
    apply(compiler: Compiler): void;
}
export default EmbeddedDependenciesWebpackPlugin;

// @beta
export interface IEmbeddedDependenciesWebpackPluginOptions {
    generatedLicenseFilename?: LicenseFileName;
    generateLicenseFile?: boolean;
    generateLicenseFileFunction?: LicenseFileGeneratorFunction;
    outputFileName?: string;
    packageFilterPredicate?: (packageJson: IPackageData, filePath: string) => boolean;
}

// @beta
export interface IPackageData extends IPackageJson {
    author?: string | {
        name?: string;
    };
    copyright: string | undefined;
    licenses?: {
        type: string;
        url: string;
    }[];
    licenseSource?: string;
}

// @beta
export type LicenseFileGeneratorFunction = (packages: IPackageData[]) => string;

// @beta
export type LicenseFileName = `${string}.${'html' | 'md' | 'txt'}`;

```
