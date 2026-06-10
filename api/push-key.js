export default function handler(req, res) {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ error: 'VAPID_PUBLIC_KEY not configured' });
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.json({ key });
}
