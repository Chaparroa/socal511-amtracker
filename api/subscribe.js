async function redis(cmd, ...args) {
  const url = process.env.UPSTASH_REDIS_REST_KV_REST_API_URL;
  let r;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([cmd, ...args]),
    });
  } catch (err) {
    let shape;
    try { shape = { hostname: new URL(url).hostname, protocol: new URL(url).protocol, len: url.length }; }
    catch { shape = { invalidUrl: true, len: url?.length ?? 0, startsWithHttp: /^https?:\/\//.test(url || '') }; }
    throw new Error(`redis fetch failed: ${err.message} — url shape: ${JSON.stringify(shape)}`);
  }
  const { result } = await r.json();
  return result;
}

export default async function handler(req, res) {
  if (!process.env.UPSTASH_REDIS_REST_KV_REST_API_URL) {
    return res.status(503).json({ error: 'Push storage not configured (UPSTASH_REDIS_REST_KV_REST_API_URL missing)' });
  }

  try {
    if (req.method === 'POST') {
      const sub = req.body;
      if (!sub?.endpoint) return res.status(400).json({ error: 'Invalid subscription object' });
      await redis('SET', 'push:subscription', JSON.stringify(sub));
      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      await redis('DEL', 'push:subscription');
      return res.json({ ok: true });
    }

    return res.status(405).end();
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
