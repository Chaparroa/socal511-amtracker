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
// Preserves notify/addedAt from any existing entry — callers only pass display fields.
export function addFavorite({ train, station, stationName, routeName }) {
  const st = station || '';
  const prev = getFavorites().find(f => f.train === train && f.station === st);
  const list = getFavorites().filter(f => !(f.train === train && f.station === st));
  list.push({
    train, station: st,
    stationName: stationName || '', routeName: routeName || '',
    notify: prev?.notify || false,
    addedAt: prev?.addedAt || Date.now(),
  });
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

export function isNotifying(train, station) {
  const st = station || '';
  const f = getFavorites().find(f => f.train === train && f.station === st);
  return !!f?.notify;
}

// Turning notify on implicitly favorites the train (can't alert on something not tracked).
// Turning it off just clears the flag — the favorite itself stays.
export function setNotify(train, station, on, info = {}) {
  const st = station || '';
  if (on && !isFavorite(train, st)) addFavorite({ train, station: st, ...info });
  const list = getFavorites().map(f =>
    (f.train === train && f.station === st) ? { ...f, notify: on } : f
  );
  saveFavorites(list);
}

// The notify:true subset, shaped for what /api/subscribe expects.
export function getNotifyList() {
  return getFavorites()
    .filter(f => f.notify)
    .map(({ train, station, stationName, routeName }) => ({ train, station, stationName, routeName }));
}
