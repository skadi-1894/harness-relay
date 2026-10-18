import { describe, it, expect } from '@jest/globals';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

describe('release gate', () => {
  it.each([
    { name: 'matching version and changelog', tag: 'v0.1.0', lock: '0.1.0', changelog: '## [0.1.0] - 2026-10-18', ok: true },
    { name: 'mismatched tag', tag: 'v0.2.0', lock: '0.1.0', changelog: '## [0.1.0] - 2026-10-18', ok: false },
    { name: 'stale lockfile', tag: 'v0.1.0', lock: '0.0.1', changelog: '## [0.1.0] - 2026-10-18', ok: false },
    { name: 'unreleased changelog', tag: 'v0.1.0', lock: '0.1.0', changelog: '## Unreleased', ok: false },
  ])('$name', async ({tag,lock,changelog,ok}) => {
    const root = await mkdtemp(join(tmpdir(), 'relay-release-test-'));
    try {
      await mkdir(join(root,'scripts'));
      await copyFile(join(process.cwd(),'scripts/release-check.mjs'),join(root,'scripts/release-check.mjs'));
      await writeFile(join(root,'package.json'),JSON.stringify({version:'0.1.0'}));
      await writeFile(join(root,'package-lock.json'),JSON.stringify({version:lock,packages:{'':{version:lock}}}));
      await writeFile(join(root,'CHANGELOG.md'),changelog);
      const check = () => execFileSync(process.execPath,[join(root,'scripts/release-check.mjs')],{env:{...process.env,GITHUB_REF_NAME:tag},stdio:'pipe'});
      if (ok) expect(check).not.toThrow(); else expect(check).toThrow();
    } finally { await rm(root,{recursive:true,force:true}); }
  });
});
