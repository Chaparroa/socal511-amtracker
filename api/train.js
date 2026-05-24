// Proxies Amtrak train data server-side to avoid browser CORS issues.
// Returns real-time status + position for a given train number.
import { fetchTrain } from 'amtrak';

export default async function handler(req, res) {
  const { number } = req.query;

  if (!number) {
    return res.status(400).json({ error: 'Missing train number' });
  }

  try {
    const trains = await fetchTrain(number);

    if (!trains || trains.length === 0) {
      return res.status(404).json({ error: `Train ${number} not found or not currently active` });
    }

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.json({ trains, fetchedAt: Date.now() });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
