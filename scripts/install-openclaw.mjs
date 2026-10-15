#!/usr/bin/env node
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: npm run agent:install -- --workspace /absolute/path/to/the/active/openclaw/workspace\nInstalls the Rockwood skill only in that workspace. Does not edit OpenClaw configuration or credentials.');
} else {
  try {
    if (args.length !== 2 || args[0] !== '--workspace' || !isAbsolute(args[1])) throw Error('Supply --workspace with the exact active OpenClaw workspace path. See --help.');
    const workspace = await realpath(args[1]);
    const repo = await realpath(fileURLToPath(new URL('..', import.meta.url)));
    // Prevent checkout paths from introducing syntax into skill shell examples.
    if (/[\n\r"`$\\]/.test(repo)) throw Error('Use a repository path without shell interpolation characters.');
    const directory = join(workspace, 'skills', 'rockwood-projects');
    const target = join(directory, 'SKILL.md');
    const text = (await readFile(new URL('../agents/openclaw/SKILL.md', import.meta.url), 'utf8')).replaceAll('{{REPO}}', repo);
    await mkdir(directory, { recursive: true });
    try { await writeFile(target, text, { flag: 'wx' }); }
    catch (error) {
      if (error.code !== 'EEXIST' || await readFile(target, 'utf8') !== text) throw Error('An existing skill differs. Review it before replacing it; it was left unchanged.');
    }
    console.log(JSON.stringify({ ok: true, skill: target, message: 'Verify skill eligibility and any existing per-agent allowlist with OpenClaw. Then start a fresh conversation or refresh skills. Authentication still requires agent:login.' }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
