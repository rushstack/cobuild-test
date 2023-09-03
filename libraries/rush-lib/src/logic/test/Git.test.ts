// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfiguration } from '../../api/RushConfiguration';
import { Git } from '../Git';
import { IGitStatusEntry } from '../GitStatusParser';

describe(Git.name, () => {
  describe(Git.normalizeGitUrlForComparison.name, () => {
    it('correctly normalizes URLs', () => {
      expect(Git.normalizeGitUrlForComparison('invalid.git')).toEqual('invalid');
      expect(Git.normalizeGitUrlForComparison('git@github.com:ExampleOrg/ExampleProject.git')).toEqual(
        'https://github.com/ExampleOrg/ExampleProject'
      );
      expect(Git.normalizeGitUrlForComparison('ssh://user@host.xz:1234/path/to/repo.git/')).toEqual(
        'https://host.xz:1234/path/to/repo'
      );
      expect(Git.normalizeGitUrlForComparison('git://host.xz/path/to/repo')).toEqual(
        'https://host.xz/path/to/repo'
      );
      expect(Git.normalizeGitUrlForComparison('http://host.xz:80/path/to/repo')).toEqual(
        'https://host.xz:80/path/to/repo'
      );
      expect(Git.normalizeGitUrlForComparison('host.xz:path/to/repo.git/')).toEqual(
        'https://host.xz/path/to/repo'
      );

      // "This syntax is only recognized if there are no slashes before the first colon.
      // This helps differentiate a local path that contains a colon."
      expect(Git.normalizeGitUrlForComparison('host/xz:path/to/repo.git/')).toEqual('host/xz:path/to/repo');

      expect(Git.normalizeGitUrlForComparison('file:///path/to/repo.git/')).toEqual('file:///path/to/repo');
      expect(Git.normalizeGitUrlForComparison('C:\\Windows\\Path.txt')).toEqual('C:\\Windows\\Path.txt');
      expect(Git.normalizeGitUrlForComparison('c:/windows/path.git')).toEqual('c:/windows/path');
    });
  });

  describe(Git.prototype.getGitStatus.name, () => {
    function getGitStatusEntriesForCommandOutput(outputSections: string[]): IGitStatusEntry[] {
      const gitInstance: Git = new Git({ rushJsonFolder: '/repo/root' } as RushConfiguration);
      jest.spyOn(gitInstance, 'getGitPathOrThrow').mockReturnValue('/git/bin/path');
      jest
        .spyOn(gitInstance, '_executeGitCommandAndCaptureOutput')
        .mockImplementation((gitPath: string, args: string[]) => {
          expect(gitPath).toEqual('/git/bin/path');
          expect(args).toEqual(['status', '--porcelain=2', '--null', '--ignored=no']);
          return outputSections.join('\0');
        });

      return Array.from(gitInstance.getGitStatus());
    }

    it('parses a git status', () => {
      expect(
        getGitStatusEntriesForCommandOutput([
          // Staged add
          '1 A. N... 000000 100644 100644 0000000000000000000000000000000000000000 a171a25d2c978ba071959f39dbeaa339fe84f768 path/a.ts',
          // Modifications, some staged and some unstaged
          '1 MM N... 100644 100644 100644 d20c7e41acf4295db610f395f50a554145b4ece7 8299b2a7d657ec1211649f14c85737d68a920d9e path/b.ts',
          // Unstaged deletion
          '1 .D N... 100644 100644 000000 3fcb58810c113c90c366dd81d16443425c7b95fa 3fcb58810c113c90c366dd81d16443425c7b95fa path/c.ts',
          // Staged deletion
          '1 D. N... 100644 000000 000000 91b0203b85a7bb605e35f842d1d05d66a6275e10 0000000000000000000000000000000000000000 path/d.ts',
          // Staged rename
          '2 R. N... 100644 100644 100644 451de43c5cb012af55a79cc3463849ab3cfa0457 451de43c5cb012af55a79cc3463849ab3cfa0457 R100 path/e.ts',
          'e2.ts',
          // Staged add
          '1 A. N... 000000 100644 100644 0000000000000000000000000000000000000000 451de43c5cb012af55a79cc3463849ab3cfa0457 path/f.ts',
          // Unstaged add
          '? path/g.ts',
          // Unstaged unresolved merge conflict
          'u .M N... 100644 100644 100644 100644 07b1571a387db3072be485e6cc5591fef35bf666 63f37aa0393e142e2c8329593eb0f78e4cc77032 ebac91ffe8227e6e9b99d9816ce0a6d166b4a524 path/unmerged.ts',
          '1 AM N... 000000 100644 100644 0000000000000000000000000000000000000000 9d9ab4adc79c591c0aa72f7fd29a008c80893e3e path/h.ts',
          ''
        ])
      ).toMatchInlineSnapshot(`
        Array [
          Object {
            "headFileMode": "000000",
            "headObjectName": "0000000000000000000000000000000000000000",
            "indexFileMode": "100644",
            "indexObjectName": "a171a25d2c978ba071959f39dbeaa339fe84f768",
            "isInSubmodule": false,
            "kind": "changed",
            "path": "path/a.ts",
            "stagedChangeType": "added",
            "unstagedChangeType": undefined,
            "worktreeFileMode": "100644",
          },
          Object {
            "headFileMode": "100644",
            "headObjectName": "d20c7e41acf4295db610f395f50a554145b4ece7",
            "indexFileMode": "100644",
            "indexObjectName": "8299b2a7d657ec1211649f14c85737d68a920d9e",
            "isInSubmodule": false,
            "kind": "changed",
            "path": "path/b.ts",
            "stagedChangeType": "modified",
            "unstagedChangeType": "modified",
            "worktreeFileMode": "100644",
          },
          Object {
            "headFileMode": "100644",
            "headObjectName": "3fcb58810c113c90c366dd81d16443425c7b95fa",
            "indexFileMode": "100644",
            "indexObjectName": "3fcb58810c113c90c366dd81d16443425c7b95fa",
            "isInSubmodule": false,
            "kind": "changed",
            "path": "path/c.ts",
            "stagedChangeType": undefined,
            "unstagedChangeType": "deleted",
            "worktreeFileMode": "000000",
          },
          Object {
            "headFileMode": "100644",
            "headObjectName": "91b0203b85a7bb605e35f842d1d05d66a6275e10",
            "indexFileMode": "000000",
            "indexObjectName": "0000000000000000000000000000000000000000",
            "isInSubmodule": false,
            "kind": "changed",
            "path": "path/d.ts",
            "stagedChangeType": "deleted",
            "unstagedChangeType": undefined,
            "worktreeFileMode": "000000",
          },
          Object {
            "headFileMode": "100644",
            "headObjectName": "451de43c5cb012af55a79cc3463849ab3cfa0457",
            "indexFileMode": "100644",
            "indexObjectName": "451de43c5cb012af55a79cc3463849ab3cfa0457",
            "isInSubmodule": false,
            "kind": "renamed",
            "originalPath": "e2.ts",
            "path": "path/e.ts",
            "renameOrCopyScore": 100,
            "stagedChangeType": "renamed",
            "unstagedChangeType": undefined,
            "worktreeFileMode": "100644",
          },
          Object {
            "headFileMode": "000000",
            "headObjectName": "0000000000000000000000000000000000000000",
            "indexFileMode": "100644",
            "indexObjectName": "451de43c5cb012af55a79cc3463849ab3cfa0457",
            "isInSubmodule": false,
            "kind": "changed",
            "path": "path/f.ts",
            "stagedChangeType": "added",
            "unstagedChangeType": undefined,
            "worktreeFileMode": "100644",
          },
          Object {
            "kind": "untracked",
            "path": "path/g.ts",
          },
          Object {
            "isInSubmodule": false,
            "kind": "unmerged",
            "path": "path/unmerged.ts",
            "stage1FileMode": "100644",
            "stage1ObjectName": "07b1571a387db3072be485e6cc5591fef35bf666",
            "stage2FileMode": "100644",
            "stage2ObjectName": "63f37aa0393e142e2c8329593eb0f78e4cc77032",
            "stage3FileMode": "100644",
            "stage3ObjectName": "ebac91ffe8227e6e9b99d9816ce0a6d166b4a524",
            "stagedChangeType": undefined,
            "unstagedChangeType": "modified",
            "worktreeFileMode": "100644",
          },
          Object {
            "headFileMode": "000000",
            "headObjectName": "0000000000000000000000000000000000000000",
            "indexFileMode": "100644",
            "indexObjectName": "9d9ab4adc79c591c0aa72f7fd29a008c80893e3e",
            "isInSubmodule": false,
            "kind": "changed",
            "path": "path/h.ts",
            "stagedChangeType": "added",
            "unstagedChangeType": "modified",
            "worktreeFileMode": "100644",
          },
        ]
      `);
    });

    it('throws with invalid git output', () => {
      expect(() =>
        getGitStatusEntriesForCommandOutput(['1 A. N... 000000 100644 100644 000000000000000000'])
      ).toThrowErrorMatchingInlineSnapshot(`"Unexpected end of git status output after position 31"`);
    });
  });
});
