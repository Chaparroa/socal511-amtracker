import { createHash } from 'crypto';

// Stable per-browser-install id derived from its push subscription endpoint —
// the endpoint URL is itself already unique per subscription, this just hashes
// it into a safe Redis key segment.
export function deviceId(endpoint) {
  return createHash('sha256').update(endpoint).digest('hex');
}
