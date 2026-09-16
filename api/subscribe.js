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
