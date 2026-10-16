#!/usr/bin/env node
// Writes a reviewable LaunchAgent file; never installs or activates it on this host.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join } from 'node:path';
import { readPrivateJson, validateConfig } from '../agents/cam-notifications.mjs';

const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
try {
  const args = process.argv.slice(2);
  if (args.includes('--help')) console.log('Usage: node scripts/cam-notify-launchagent.mjs --config /private/config.json --output /absolute/new.plist\nWrites a once-per-minute macOS LaunchAgent using this Node executable. Does not load it.');
  else {
    if (args.length !== 4 || args[0] !== '--config' || args[2] !== '--output' || !isAbsolute(args[1]) || !isAbsolute(args[3])) throw Error('Use --config and --output with absolute paths.');
    const config = validateConfig(await readPrivateJson(args[1], 16000));
    const script = fileURLToPath(new URL('cam-notify.mjs', import.meta.url));
    const argv = [process.execPath, script, 'run', '--config', args[1], '--send'];
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.rockwood.cam-notify</string>
<key>ProgramArguments</key><array>${argv.map(value => `<string>${xml(value)}</string>`).join('')}</array>
<key>WorkingDirectory</key><string>${xml(dirname(dirname(script)))}</string>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml([dirname(process.execPath), dirname(config.openclawBin), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':'))}</string></dict>
<key>StartInterval</key><integer>60</integer>
<key>RunAtLoad</key><true/>
<key>ProcessType</key><string>Background</string>
<key>StandardOutPath</key><string>${xml(join(config.stateDir, 'connector.log'))}</string>
<key>StandardErrorPath</key><string>${xml(join(config.stateDir, 'connector-error.log'))}</string>
</dict></plist>\n`;
    await writeFile(args[3], plist, { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ ok: true, path: args[3], activated: false }));
  }
} catch { console.error('Could not write a new LaunchAgent. Check private configuration, output path and existing files. Nothing was activated.'); process.exitCode = 1; }
