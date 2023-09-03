// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { JsonFile } from '../JsonFile';

// The PosixModeBits are intended to be used with bitwise operations.
/* eslint-disable no-bitwise */

describe(JsonFile.name, () => {
  it('adds a header comment', () => {
    expect(
      JsonFile.stringify(
        { abc: 123 },
        {
          headerComment: '// header\n// comment'
        }
      )
    ).toMatchSnapshot();
  });
  it('adds an empty header comment', () => {
    expect(
      JsonFile.stringify(
        { abc: 123 },
        {
          headerComment: ''
        }
      )
    ).toMatchSnapshot();
  });
  it('allows undefined values when asked', () => {
    expect(
      JsonFile.stringify(
        { abc: undefined },
        {
          ignoreUndefinedValues: true
        }
      )
    ).toMatchSnapshot();

    expect(
      JsonFile.stringify(
        { abc: undefined },
        {
          ignoreUndefinedValues: true,
          prettyFormatting: true
        }
      )
    ).toMatchSnapshot();
  });
});
