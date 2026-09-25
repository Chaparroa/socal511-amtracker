// Client-side favorites — localStorage only, per-device. No backend involved.
// Persists across visits and survives "Add to Home Screen" on iOS (same storage
// silo as Safari for the origin), so it holds up as a personal train list.
const KEY = 'amtracker:favorites:v1';

export function getFavorites() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveFavorites(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable (private browsing, quota) — favorites just won't persist.
  }
}

export function isFavorite(train, station) {
  const st = station || '';
  return getFavorites().some(f => f.train === train && f.station === st);
}

// Adds, or refreshes the snapshot if this train/station is already saved.
export function addFavorite({ train, station, stationName, routeName }) {
  const st = station || '';
  const list = getFavorites().filter(f => !(f.train === train && f.station === st));
  list.push({ train, station: st, stationName: stationName || '', routeName: routeName || '', addedAt: Date.now() });
  saveFavorites(list);
}

export function removeFavorite(train, station) {
  const st = station || '';
  saveFavorites(getFavorites().filter(f => !(f.train === train && f.station === st)));
}

export function toggleFavorite(info) {
  if (isFavorite(info.train, info.station)) {
    removeFavorite(info.train, info.station);
    return false;
  }
  addFavorite(info);
  return true;
}
