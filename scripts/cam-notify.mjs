#!/usr/bin/env node
import { checkNotifications, initializeNotifications, notificationFailure, notificationStatus, readPrivateJson, reconcileNotification, runNotifications } from '../agents/cam-notifications.mjs';

const HELP = `Rockwood Cam → PDF + short summary + questions for Chris and Mike.
Usage:
  node scripts/cam-notify.mjs init --config /private/config.json
  node scripts/cam-notify.mjs check --config /private/config.json
  node scripts/cam-notify.mjs preview --config /private/config.json
  node scripts/cam-notify.mjs run --config /private/config.json --send
  node scripts/cam-notify.mjs status --config /private/config.json
  node scripts/cam-notify.mjs reconcile --config /private/config.json --resolution /private/resolution.json

init starts at the current time, is idempotent, and sends nothing. Historical PDFs are excluded.
check verifies live workspace access and reviewer restrictions; it sends nothing.
preview downloads pending PDFs/evidence only; it invokes no model and sends nothing.
run requires --send, an explicitly configured group/account and a read/pdf-only review agent.
status shows the delivery journal. An uncertain send is never automatically repeated.
reconcile requires human verification of delivered/not-delivered; see agents/CAM-NOTIFICATIONS.md.
No command writes workspace records. The office Mac must remain awake and connected.
`;
try {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) { console.log(HELP); }
  else {
    const action = args.shift(), flags = {};
    while (args.length) {
      const name = args.shift();
      if (!['--config', '--resolution', '--send'].includes(name) || Object.hasOwn(flags, name)) throw Error('Invalid options. See --help.');
      flags[name] = name === '--send' ? true : args.shift();
    }
    if (!flags['--config'] || !['init', 'check', 'preview', 'run', 'status', 'reconcile'].includes(action) || (flags['--send'] && action !== 'run') || (flags['--resolution'] && action !== 'reconcile')) throw Error('Invalid command. See --help.');
    const config = await readPrivateJson(flags['--config'], 16000);
    let result;
    if (action === 'init') result = await initializeNotifications(config);
    if (action === 'check') result = await checkNotifications(config);
    if (action === 'status') result = await notificationStatus(config);
    if (action === 'preview') result = await runNotifications(config);
    if (action === 'run') {
      if (!flags['--send']) throw Error('Use --send only on the authorized office connector.');
      result = await runNotifications(config, { send: true });
    }
    if (action === 'reconcile') {
      if (!flags['--resolution']) throw Error('Supply a private, human-verified resolution file.');
      result = await reconcileNotification(config, await readPrivateJson(flags['--resolution'], 16000));
    }
    console.log(JSON.stringify({ ok: true, result }));
    if (result?.attention?.length || result?.failures?.length) process.exitCode = 2;
  }
} catch (failure) {
  console.error(JSON.stringify({ ok: false, error: notificationFailure(failure) }));
  process.exitCode = 1;
}
