// Run the review SLA once, against whatever DATABASE_URL points at.
//
//   npm run sla
//
// The same function the scheduled route calls. Exists because a timer you cannot
// run by hand is a timer nobody can debug — and because there is no cron on this
// machine.

import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv();

async function main() {
  const { runReviewSla } = await import('../src/lib/review/sla');
  const { closePool } = await import('../src/lib/db/pool');
  const result = await runReviewSla();

  if (result.checked === 0) {
    console.log('No review has lapsed.');
    await closePool();
    return;
  }

  console.log(`${result.checked} lapsed review(s):`);
  for (const lapse of result.lapses) {
    console.log(
      `  ${lapse.code} · ${lapse.brandName} · waiting ${lapse.daysWaiting}d · ${lapse.action}` +
        (lapse.handled ? '' : ' (already handled for this package version)'),
    );
  }

  await closePool();
}

// No process.exit on success: closePool() has already released the connection,
// and exiting the instant it resolves cuts the socket teardown short — which the
// dev database's socket bridge does not recover from cleanly.
main().catch((error) => {
  console.error('SLA run failed:', error);
  process.exitCode = 1;
});
