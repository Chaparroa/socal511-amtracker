// Proxies Amtrak train data server-side to avoid browser CORS issues.
// Returns real-time status + position for a given train number.
// When a train isn't active, also returns currently active trains at the
// requested station so the UI can show helpful context.
import { fetchTrain, fetchStation } from 'amtrak';

export default async function handler(req, res) {
  const { number, station } = req.query;

  if (!number) {
    return res.status(400).json({ error: 'Missing train number' });
  }

  try {
    const trains = await fetchTrain(number);

    if (!trains || trains.length === 0) {
      // Train not active — fetch station context if a station code was provided
      let stationTrains = null;
      if (station) {
        try {
          const stationData = await fetchStation(station.toUpperCase());
          stationTrains = stationData;
        } catch (_) { /* station lookup is best-effort */ }
      }

      return res.status(404).json({
        notActive: true,
        error: `Train ${number} is not currently active. It may have already completed its run, or hasn't departed yet.`,
        stationTrains,
        fetchedAt: Date.now(),
      });
    }

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.json({ trains, fetchedAt: Date.now() });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
