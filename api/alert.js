// Checks train 770 status and sends a web push alert if it's delayed.
// Called by cron-job.org on a tiered schedule: every 10 min (7am), every 3 min (8am), every 10 min (9–10am).
// Deduplicates via Upstash Redis — one alert per delay event, re-alerts if delay worsens 10+ min.
import { fetchTrain } from 'amtrak';
import webpush        from 'web-push';

const TRAIN_NUMBER = '770';
const STATION_CODE = 'CWT';
const STATION_NAME = 'Chatsworth';
const TRACKER_URL  = 'https://socal511-amtracker.vercel.app/train/770?station=CWT';
const DELAY_MIN    = 5;
const COOLDOWN_MS  = 45 * 60 * 1000;
const WORSEN_MIN   = 10;
const DEDUP_KEY    = 'alert:dedup';

// ── State (dedup via Redis) ───────────────────────────────────────
async function loadState() {
  try {
    const raw = await redis('GET', DEDUP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function saveState(state) {
  try {
    // Expire at midnight PT so each day starts clean
    await redis('SET', DEDUP_KEY, JSON.stringify(state), 'EX', 86400);
  } catch { /* non-fatal */ }
}

// ── Upstash Redis ─────────────────────────────────────────────────
async function redis(cmd, ...args) {
  const r = await fetch(process.env.UPSTASH_REDIS_REST_KV_REST_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([cmd, ...args]),
  });
  const { result } = await r.json();
  return result;
}

// ── Web Push ──────────────────────────────────────────────────────
async function sendPush(title, body) {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, UPSTASH_REDIS_REST_KV_REST_API_URL } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !UPSTASH_REDIS_REST_KV_REST_API_URL) return null;

  const raw = await redis('GET', 'push:subscription');
  if (!raw) return { skipped: 'no subscription stored' };

  const subscription = JSON.parse(raw);
  webpush.setVapidDetails('mailto:achaparro41@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({ title, body, url: TRACKER_URL })
    );
    return { sent: true };
  } catch (err) {
    if (err.statusCode === 410) {
      // Subscription expired — clean up so it doesn't keep failing
      await redis('DEL', 'push:subscription');
      return { skipped: 'subscription expired, removed from store' };
    }
    throw err;
  }
}

// ── Handler ───────────────────────────────────────────────────────
export default async function handler(req, res) {
  const secret = process.env.ALERT_SECRET;
  if (secret && req.query.key !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const raw = await fetchTrain(TRAIN_NUMBER);
    const trains = Array.isArray(raw) ? raw : raw ? Object.values(raw).flat() : [];

    if (!trains || trains.length === 0) {
      return res.json({ status: 'not_active', message: `Train ${TRAIN_NUMBER} not currently running` });
    }

    const train    = trains[0];
    const stations = train.stations || [];
    const myStop   = stations.find(s => s.code === STATION_CODE);

    let delay = 0;
    if (myStop?.arr && myStop?.schArr) {
      delay = Math.round((new Date(myStop.arr) - new Date(myStop.schArr)) / 60000);
    } else {
      const last = [...stations].reverse().find(s => s.arr && s.schArr);
      if (last) delay = Math.round((new Date(last.arr) - new Date(last.schArr)) / 60000);
    }

    if (delay <= DELAY_MIN) {
      return res.json({ status: 'on_time', delay, message: 'Train on time — no alert needed' });
    }

    const state = await loadState();
    const now   = Date.now();
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

    if (state && state.date === today) {
      const tooSoon      = (now - state.sentAt) < COOLDOWN_MS;
      const notMuchWorse = delay < state.delay + WORSEN_MIN;
      if (tooSoon && notMuchWorse) {
        return res.json({
          status: 'deduped',
          delay,
          lastDelay: state.delay,
          message: `Alert already sent at ${new Date(state.sentAt).toLocaleTimeString()} — skipping`,
        });
      }
    }

    const statusMsg = train.statusMsg ? ` (${train.statusMsg})` : '';
    const title     = `Train ${TRAIN_NUMBER} — ${delay} min delay`;
    const body      = `Running ${delay} min late${statusMsg}. Your stop: ${STATION_NAME}.`;

    let pushResult;
    try {
      pushResult = { status: 'fulfilled', value: await sendPush(title, body) };
    } catch (err) {
      pushResult = { status: 'rejected', reason: err };
    }

    await saveState({ date: today, sentAt: now, delay });

    return res.json({
      status: 'alert_sent',
      delay,
      push: pushResult.status === 'fulfilled' ? pushResult.value : { error: pushResult.reason?.message },
    });

  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
