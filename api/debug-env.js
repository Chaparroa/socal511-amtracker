export default function handler(req, res) {
  const names = Object.keys(process.env).filter(k => /UPSTASH|REDIS|KV|VAPID/i.test(k)).sort();
  return res.json({ names });
}
