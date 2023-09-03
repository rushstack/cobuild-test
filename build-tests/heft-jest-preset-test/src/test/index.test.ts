// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { addThreeStars } from '..';

describe(addThreeStars.name, () => {
  it('adds three stars', () => {
    expect(addThreeStars('***Hello World')).toEqual('***Hello World***');
  });
});
