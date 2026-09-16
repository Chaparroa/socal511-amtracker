// Touches Redis so Upstash's free-tier database doesn't get archived after
// 30 days of inactivity. Call this on a weekly cron — independent of
// whether train 770 is running or delayed.
export default async function handler(req, res) {
  const r = await fetch(process.env.UPSTASH_REDIS_REST_KV_REST_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(['SET', 'keepalive:last-ping', new Date().toISOString()]),
  });
  if (!r.ok) return res.status(502).json({ error: `Redis REST error ${r.status}` });
  return res.json({ ok: true, pingedAt: new Date().toISOString() });
}
