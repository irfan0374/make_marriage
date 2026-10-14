// Development stand-in for cron-job.org (architecture §9.4): calls the job queue every minute
// and the scheduled work every hour while it runs, so queued emails and automatic reminders go
// out on your laptop.
// Run it in a second terminal next to `pnpm dev`:  pnpm jobs:dev
// It only calls the app over HTTP with the cron secret; it never touches the database itself.

const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
const secret = process.env.CRON_SECRET;
const EVERY_MS = 60_000;

if (!secret) {
  console.error('CRON_SECRET is not set in .env.local. See .env.example.');
  process.exit(1);
}

async function runOnce(): Promise<void> {
  const time = new Date().toLocaleTimeString();
  try {
    const response = await fetch(new URL('/api/cron/process-jobs', appUrl), {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
    });
    const body = (await response.json().catch(() => null)) as {
      data?: {
        claimed: number;
        done: number;
        skipped: number;
        deferred: number;
        retried: number;
        failed: number;
        dailyEmailRemaining: number;
      };
      error?: { code: string };
    } | null;
    if (!response.ok || !body?.data) {
      console.log(`[${time}] queue run failed: ${response.status} ${body?.error?.code ?? ''}`);
      return;
    }
    const { claimed, done, skipped, deferred, retried, failed, dailyEmailRemaining } = body.data;
    console.log(
      claimed === 0
        ? deferred > 0
          ? `[${time}] daily email limit reached; the rest go out tomorrow`
          : `[${time}] nothing to send (${dailyEmailRemaining} emails left today)`
        : `[${time}] ${done} sent, ${skipped} not needed, ${retried} to retry, ${failed} failed (${dailyEmailRemaining} left today)`,
    );
  } catch {
    console.log(`[${time}] couldn't reach ${appUrl}. Is \`pnpm dev\` running?`);
  }
}

/** The hourly scheduled work (automatic reminders at 9 AM in each wedding's timezone). */
async function runScheduled(): Promise<void> {
  const time = new Date().toLocaleTimeString();
  try {
    const response = await fetch(new URL('/api/cron/daily', appUrl), {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}` },
    });
    const body = (await response.json().catch(() => null)) as {
      data?: { rsvpRemindersQueued: number };
    } | null;
    if (body?.data && body.data.rsvpRemindersQueued > 0) {
      console.log(`[${time}] queued ${body.data.rsvpRemindersQueued} automatic reminders`);
    } else if (!response.ok) {
      console.log(`[${time}] scheduled run failed: ${response.status}`);
    }
  } catch {
    console.log(`[${time}] couldn't reach ${appUrl} for the scheduled run.`);
  }
}

console.log(
  `Processing the job queue at ${appUrl} every minute, and scheduled work every hour. Press Ctrl+C to stop.`,
);
void runScheduled().then(runOnce);
setInterval(() => void runOnce(), EVERY_MS);
setInterval(() => void runScheduled(), 60 * EVERY_MS);
