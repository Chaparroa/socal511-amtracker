// Returns all active trains currently associated with a given station code.
import { fetchStation } from 'amtrak';

export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Missing station code' });
  }

  try {
    const data = await fetchStation(code.toUpperCase());

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.json({ station: data, fetchedAt: Date.now() });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
