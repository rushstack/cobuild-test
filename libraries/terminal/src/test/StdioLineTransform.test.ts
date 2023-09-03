// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { TerminalChunkKind } from '../ITerminalChunk';
import { StderrLineTransform } from '../StdioLineTransform';
import { MockWritable } from '../MockWritable';

describe(StderrLineTransform.name, () => {
  it('should report stdout if there is no stderr', () => {
    const mockWritable: MockWritable = new MockWritable();
    const transform: StderrLineTransform = new StderrLineTransform({ destination: mockWritable });

    transform.writeChunk({ text: 'stdout 1\nstdout 2\n', kind: TerminalChunkKind.Stdout });
    transform.close();

    expect(mockWritable.chunks).toMatchSnapshot();
  });
});
