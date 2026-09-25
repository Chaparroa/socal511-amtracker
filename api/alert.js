// Checks every actively-watched (train, station) pair and sends a web push alert
// to whichever devices are watching it, if it's delayed. Called by cron-job.org
// on a fixed cadence (see plan doc / README) — polling frequency per pair is
// self-throttled below, relative to that pair's own scheduled arrival time, so
// the cron cadence just needs to be at least as fine as the tightest tier.
import { fetchTrain } from 'amtrak';
import webpush        from 'web-push';
import { redis, redisConfigured } from '../lib/redis.js';

const DELAY_MIN    = 5;
const COOLDOWN_MS  = 45 * 60 * 1000;
const WORSEN_MIN   = 10;
const DEDUP_TTL    = 60 * 60 * 24;       // 1 day
const SCHED_TTL    = 60 * 60 * 24 * 14;  // 14 days — self-refreshes on every observation
const SCHED_PENDING_TTL = 60 * 60 * 24 * 3; // never-observed pairs quietly expire and retry later
const TRACKER_BASE = 'https://socal511-amtracker.vercel.app';

// Bootstrap polling (for a pair with no cached schedule yet) is gated to these
// Pacific-time hours so it doesn't fire overnight when nothing is running.
const SERVICE_HOUR_START = 5;
const SERVICE_HOUR_END   = 22;

const INTERVAL_MS = {
  bootstrap: 45 * 60 * 1000,
  loose:     10 * 60 * 1000,
  tight:      3 * 60 * 1000,
  tail:      10 * 60 * 1000,
};

// ── Pacific-time helpers ────────────────────────────────────────────
function pacificParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(date);
  const get = t => Number(parts.find(p => p.type === t).value);
  let hour = get('hour');
  if (hour === 24) hour = 0; // midnight can format as "24"
  return { hour, minute: get('minute') };
}

function minutesOfDay(date) {
  const { hour, minute } = pacificParts(date);
  return hour * 60 + minute;
}

// Which polling tier a pair is in right now, given minutes-until-scheduled-arrival.
// Mirrors the old hand-tuned 10/3/10 cron windows, but relative to each train's
// own arrival instead of a fixed wall-clock hour.
function tierFor(nowMin, schedMin) {
  if (schedMin == null) return 'bootstrap';
  let delta = schedMin - nowMin; // minutes until scheduled arrival
  if (delta > 720) delta -= 1440;   // normalize across midnight
  if (delta < -720) delta += 1440;
  if (delta > 120 || delta < -135) return null; // outside the watch window entirely
  if (delta > 60) return 'loose';    // T-120 .. T-60
  if (delta >= -15) return 'tight';  // T-60 .. T+15
  return 'tail';                     // T+15 .. T+135
}

function delayMin(estIso, schIso) {
  if (!estIso || !schIso) return 0;
  return Math.round((new Date(estIso) - new Date(schIso)) / 60000);
}

function pairKey(train, station) { return `${train}|${station}`; }

// ── Handler ───────────────────────────────────────────────────────
export default async function handler(req, res) {
  const secret = process.env.ALERT_SECRET;
  if (secret && req.query.key !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!redisConfigured()) {
    return res.status(503).json({ error: 'Push storage not configured' });
  }

  try {
    const ids = await redis('SMEMBERS', 'push:sub:index');
    if (!ids || ids.length === 0) {
      return res.json({ status: 'idle', message: 'No subscribers' });
    }

    const rawDocs = await redis('MGET', ...ids.map(id => `push:sub:${id}`));

    const devices = [];   // { id, subscription, watches }
    const deadIds = [];   // ids to clean up at the end (expired docs + 410s)
    ids.forEach((id, i) => {
      const raw = rawDocs[i];
      if (!raw) { deadIds.push(id); return; }
      try {
        const doc = JSON.parse(raw);
        devices.push({ id, subscription: doc.subscription, watches: doc.watches || [] });
      } catch { /* corrupt doc — skip it, don't abort the whole tick */ }
    });

    // Union of distinct watched (train, station) pairs -> which devices care
    const watchersByPair = new Map();
    for (const dev of devices) {
      for (const w of dev.watches) {
        if (!w?.train || !w?.station) continue;
        const key = pairKey(w.train, w.station);
        if (!watchersByPair.has(key)) {
          watchersByPair.set(key, { train: w.train, station: w.station, stationName: w.stationName || '', deviceIds: new Set() });
        }
        watchersByPair.get(key).deviceIds.add(dev.id);
      }
    }

    if (watchersByPair.size === 0) {
      return res.json({ status: 'idle', message: 'No watched trains' });
    }

    const now = new Date();
    const nowMin = minutesOfDay(now);
    const { hour: nowHour } = pacificParts(now);
    const inServiceHours = nowHour >= SERVICE_HOUR_START && nowHour < SERVICE_HOUR_END;

    const pairKeys = [...watchersByPair.keys()];
    const schedRaw = await redis('MGET', ...pairKeys.map(k => {
      const [train, station] = k.split('|');
      return `sched:${train}:${station}`;
    }));

    // Decide which pairs are actually due for a poll this tick
    const duePairs = [];
    pairKeys.forEach((key, i) => {
      const pair = watchersByPair.get(key);
      let sched = null;
      try { sched = schedRaw[i] ? JSON.parse(schedRaw[i]) : null; } catch { sched = null; }

      const tier = tierFor(nowMin, sched?.schedMin ?? null);
      if (!tier) return;
      if (tier === 'bootstrap' && !inServiceHours) return;
      if (Date.now() - (sched?.lastPolledAt || 0) < INTERVAL_MS[tier]) return;

      duePairs.push({ key, ...pair, tier, prevSched: sched });
    });

    if (duePairs.length === 0) {
      return res.json({ status: 'idle', message: 'Nothing due this tick', watched: watchersByPair.size });
    }

    // Fetch each distinct train number at most once, shared across every pair/subscriber on it
    const trainsToFetch = [...new Set(duePairs.map(p => p.train))];
    const trainData = new Map();
    await Promise.all(trainsToFetch.map(async (num) => {
      try {
        const raw = await fetchTrain(num);
        const trains = Array.isArray(raw) ? raw : raw ? Object.values(raw).flat() : [];
        trainData.set(num, trains[0] || null);
      } catch {
        trainData.set(num, null);
      }
    }));

    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails('mailto:achaparro41@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    }

    const results = [];
    for (const pair of duePairs) {
      const train    = trainData.get(pair.train);
      const schedKey = `sched:${pair.train}:${pair.station}`;

      if (!train) {
        // Not currently active — advance the throttle, leave any known schedule alone
        const ttl = pair.prevSched?.schedMin != null ? SCHED_TTL : SCHED_PENDING_TTL;
        await redis('SET', schedKey, JSON.stringify({
          schedMin: pair.prevSched?.schedMin ?? null,
          lastObservedAt: pair.prevSched?.lastObservedAt ?? null,
          lastPolledAt: Date.now(),
        }), 'EX', ttl);
        results.push({ pair: pair.key, tier: pair.tier, status: 'not_active' });
        continue;
      }

      const stations = train.stations || [];
      const myStop   = stations.find(s => s.code === pair.station);
      const stationName = myStop?.name || pair.stationName || pair.station;

      let delay = 0;
      let observedSchedMin = pair.prevSched?.schedMin ?? null;
      if (myStop?.arr && myStop?.schArr) {
        delay = delayMin(myStop.arr, myStop.schArr);
        observedSchedMin = minutesOfDay(new Date(myStop.schArr));
      } else {
        const last = [...stations].reverse().find(s => s.arr && s.schArr);
        if (last) delay = delayMin(last.arr, last.schArr);
      }

      await redis('SET', schedKey, JSON.stringify({
        schedMin: observedSchedMin, lastObservedAt: Date.now(), lastPolledAt: Date.now(),
      }), 'EX', SCHED_TTL);

      if (delay <= DELAY_MIN) {
        results.push({ pair: pair.key, tier: pair.tier, status: 'on_time', delay });
        continue;
      }

      const dedupKey = `dedup:${pair.train}:${pair.station}`;
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

      const existingRaw = await redis('GET', dedupKey);
      let existing = null;
      try { existing = existingRaw ? JSON.parse(existingRaw) : null; } catch { existing = null; }

      if (existing && existing.date === today) {
        const tooSoon = (Date.now() - existing.sentAt) < COOLDOWN_MS;
        const notMuchWorse = delay < existing.delay + WORSEN_MIN;
        if (tooSoon && notMuchWorse) {
          results.push({ pair: pair.key, tier: pair.tier, status: 'deduped', delay, lastDelay: existing.delay });
          continue;
        }
      }

      const statusMsg = train.statusMsg ? ` (${train.statusMsg})` : '';
      const title = `Train ${pair.train} — ${delay} min delay`;
      const body  = `Running ${delay} min late${statusMsg}. Your stop: ${stationName}.`;
      const url   = `${TRACKER_BASE}/train/${pair.train}?station=${pair.station}`;

      let pushResult = { skipped: 'VAPID not configured' };
      if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
        const targets = devices.filter(d => pair.deviceIds.has(d.id));
        const sent = await Promise.allSettled(targets.map(d =>
          webpush.sendNotification(d.subscription, JSON.stringify({ title, body, url }))
            .catch(err => {
              if (err.statusCode === 410) deadIds.push(d.id);
              throw err;
            })
        ));
        pushResult = {
          sent: sent.filter(r => r.status === 'fulfilled').length,
          failed: sent.filter(r => r.status === 'rejected').length,
        };
      }

      await redis('SET', dedupKey, JSON.stringify({ date: today, sentAt: Date.now(), delay }), 'EX', DEDUP_TTL);
      results.push({ pair: pair.key, tier: pair.tier, status: 'alert_sent', delay, push: pushResult });
    }

    if (deadIds.length > 0) {
      const uniqueDead = [...new Set(deadIds)];
      await Promise.all(uniqueDead.map(id => redis('DEL', `push:sub:${id}`)));
      await redis('SREM', 'push:sub:index', ...uniqueDead);
    }

    return res.json({ status: 'ok', watched: watchersByPair.size, due: duePairs.length, results });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
