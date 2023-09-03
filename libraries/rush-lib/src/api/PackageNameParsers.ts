// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PackageNameParser } from '@rushstack/node-core-library';

export class PackageNameParsers {
  /**
   * This is the default for `RushConfiguration.packageNameParser`.
   */
  public static rushDefault: PackageNameParser = new PackageNameParser({});

  /**
   * This is the `RushConfiguration.packageNameParser` used when `allowMostlyStandardPackageNames = true`
   * in rush.json.
   */
  public static mostlyStandard: PackageNameParser = new PackageNameParser({
    allowUpperCase: true
  });

  /**
   * Use this in contexts where we don't have easy access to `RushConfiguration.packageNameParser`
   * AND the package name was already validated at some earlier stage.
   */
  public static permissive: PackageNameParser = PackageNameParsers.mostlyStandard;
}
