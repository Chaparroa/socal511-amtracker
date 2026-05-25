// Checks train 770 status and sends an SMS via Twilio if it's delayed.
// Intended to be called by an external cron job (cron-job.org) every 10 min
// during the morning window. Deduplicates via /tmp state so only one SMS
// is sent per delay event, with a follow-up only if delay worsens by 10+ min.
import { fetchTrain } from 'amtrak';
import { readFileSync, writeFileSync } from 'fs';

const TRAIN_NUMBER   = '770';
const STATION_CODE   = 'CWT';
const STATION_NAME   = 'Chatsworth';
const TRACKER_URL    = 'https://socal511-amtracker.vercel.app/train/770?station=CWT';
const DELAY_MIN      = 5;    // minutes late before alerting
const COOLDOWN_MS    = 45 * 60 * 1000; // don't re-alert within 45 min unless delay worsens
const WORSEN_MIN     = 10;   // re-alert if delay grows by this much
const STATE_FILE     = '/tmp/amtracker-state.json';

function loadState() {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); }
  catch { return null; }
}

function saveState(state) {
  try { writeFileSync(STATE_FILE, JSON.stringify(state)); }
  catch { /* /tmp write failure is non-fatal */ }
}

async function sendSMS(message) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_FROM;
  const to    = process.env.ALERT_TO;

  if (!sid || !token || !from || !to) {
    throw new Error('Missing Twilio env vars (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, ALERT_TO)');
  }

  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const r = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method:  'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({ To: to, From: from, Body: message }).toString(),
    }
  );

  if (!r.ok) throw new Error(`Twilio ${r.status}: ${await r.text()}`);
  return r.json();
}

export default async function handler(req, res) {
  // Optional secret key — set ALERT_SECRET in Vercel env vars and pass ?key=... in the cron URL
  const secret = process.env.ALERT_SECRET;
  if (secret && req.query.key !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const trains = await fetchTrain(TRAIN_NUMBER);

    if (!trains || trains.length === 0) {
      return res.json({ status: 'not_active', message: `Train ${TRAIN_NUMBER} not currently running` });
    }

    const train    = trains[0];
    const stations = train.stations || [];
    const myStop   = stations.find(s => s.code === STATION_CODE);

    // Calculate delay at our station
    let delay = 0;
    if (myStop?.estArr && myStop?.schArr) {
      delay = Math.round((new Date(myStop.estArr) - new Date(myStop.schArr)) / 60000);
    } else {
      // Fall back to overall train delay from last reported station
      const last = [...stations].reverse().find(s => s.estArr && s.schArr);
      if (last) delay = Math.round((new Date(last.estArr) - new Date(last.schArr)) / 60000);
    }

    if (delay <= DELAY_MIN) {
      return res.json({ status: 'on_time', delay, message: 'Train on time — no alert needed' });
    }

    // Dedup: skip if we already alerted recently and delay hasn't significantly worsened
    const state = loadState();
    const now   = Date.now();
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }); // YYYY-MM-DD

    if (state && state.date === today) {
      const tooSoon     = (now - state.sentAt) < COOLDOWN_MS;
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

    // Build SMS
    const statusMsg  = train.statusMsg ? ` (${train.statusMsg})` : '';
    const message =
      `Train ${TRAIN_NUMBER} is running ${delay} min late${statusMsg}.\n` +
      `Your stop: ${STATION_NAME}\n` +
      `Track live: ${TRACKER_URL}`;

    await sendSMS(message);
    saveState({ date: today, sentAt: now, delay });

    return res.json({ status: 'alert_sent', delay, message: `SMS sent — ${delay} min delay` });

  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
