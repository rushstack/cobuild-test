// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import colors from 'colors';

import { TerminalChunkKind } from '../ITerminalChunk';
import { MockWritable } from '../MockWritable';
import { TextRewriterTransform } from '../TextRewriterTransform';
import { NewlineKind, Text } from '@rushstack/node-core-library';

describe(TextRewriterTransform.name, () => {
  it('should apply standard rewriters', () => {
    const mockWritable: MockWritable = new MockWritable();
    const transform: TextRewriterTransform = new TextRewriterTransform({
      destination: mockWritable,
      removeColors: true,
      ensureNewlineAtEnd: true,
      normalizeNewlines: NewlineKind.Lf
    });

    // This color code will be removed
    transform.writeChunk({ text: colors.red('RED'), kind: TerminalChunkKind.Stderr });
    // These newlines will be converted to \n
    transform.writeChunk({ text: 'stderr 1\r\nstderr 2\r\n', kind: TerminalChunkKind.Stderr });

    // The incomplete color code will be passed through
    // The incomplete line will have \n appended
    transform.writeChunk({ text: 'stdout 3\r\nstdout 4\x1b[1', kind: TerminalChunkKind.Stdout });

    transform.close();

    expect(
      mockWritable.chunks.map((x) => ({
        kind: x.kind,
        text: Text.replaceAll(x.text, '\n', '[n]')
      }))
    ).toMatchSnapshot();
  });
});
