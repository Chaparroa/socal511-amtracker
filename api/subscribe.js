import { redis, redisConfigured } from '../lib/redis.js';
import { deviceId } from '../lib/device.js';

const SUB_TTL = 60 * 60 * 24 * 90; // 90 days

export default async function handler(req, res) {
  if (!redisConfigured()) {
    return res.status(503).json({ error: 'Push storage not configured (UPSTASH_REDIS_REST_KV_REST_API_URL missing)' });
  }

  try {
    if (req.method === 'POST') {
      const { subscription, watches } = req.body || {};
      if (!subscription?.endpoint) return res.status(400).json({ error: 'Invalid subscription object' });

      const id  = deviceId(subscription.endpoint);
      const doc = { subscription, watches: Array.isArray(watches) ? watches : [], updatedAt: Date.now() };

      await redis('SET', `push:sub:${id}`, JSON.stringify(doc), 'EX', SUB_TTL);
      await redis('SADD', 'push:sub:index', id);
      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { endpoint } = req.body || {};
      if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });

      const id = deviceId(endpoint);
      await redis('DEL', `push:sub:${id}`);
      await redis('SREM', 'push:sub:index', id);
      return res.json({ ok: true });
    }

    return res.status(405).end();
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
