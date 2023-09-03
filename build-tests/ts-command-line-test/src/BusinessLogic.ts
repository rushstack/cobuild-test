// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export class BusinessLogic {
  public static async doTheWork(force: boolean, protocol: string): Promise<void> {
    console.log(`Received parameters: force=${force}, protocol="${protocol}"`);
    console.log(`Business logic did the work.`);
  }

  public static configureLogger(verbose: boolean): void {
    console.log(`Business logic configured the logger: verbose=${verbose}`);
  }
}
