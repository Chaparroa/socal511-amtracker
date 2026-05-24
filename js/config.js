// Stations of interest — add more as needed
export const STATIONS = {
  CWT: { name: 'Chatsworth', city: 'Chatsworth, CA', lat: 34.2573, lon: -118.5957 },
  VNY: { name: 'Van Nuys',   city: 'Van Nuys, CA',   lat: 34.1836, lon: -118.4490 },
  BUR: { name: 'Burbank',    city: 'Burbank, CA',     lat: 34.1808, lon: -118.3089 },
  LAX: { name: 'Los Angeles', city: 'Los Angeles, CA', lat: 34.0560, lon: -118.2356 },
  SBA: { name: 'Santa Barbara', city: 'Santa Barbara, CA', lat: 34.4208, lon: -119.6982 },
  OXN: { name: 'Oxnard',     city: 'Oxnard, CA',      lat: 34.1958, lon: -119.1771 },
};

// Your default morning train
export const DEFAULT_TRAIN  = '770';
export const DEFAULT_STATION = 'CWT';

// Amtrak route colors (for map polyline / badge)
export const ROUTE_COLORS = {
  'Pacific Surfliner': '#0077C8',
  'Coast Starlight':   '#003865',
  'Southwest Chief':   '#E31837',
  'Sunset Limited':    '#F5A800',
};
