// Upstash Redis REST helper, shared by api/subscribe.js and api/alert.js.
export function redisConfigured() {
  return !!process.env.UPSTASH_REDIS_REST_KV_REST_API_URL;
}

export async function redis(cmd, ...args) {
  const r = await fetch(process.env.UPSTASH_REDIS_REST_KV_REST_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([cmd, ...args]),
  });
  if (!r.ok) throw new Error(`Redis REST error ${r.status}`);
  const { result } = await r.json();
  return result;
}
