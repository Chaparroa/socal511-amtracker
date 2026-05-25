// Stations of interest — add more as needed
export const STATIONS = {
  CWT: { name: 'Chatsworth', city: 'Chatsworth, CA', lat: 34.2573, lon: -118.5957 },
  VNY: { name: 'Van Nuys',   city: 'Van Nuys, CA',   lat: 34.1836, lon: -118.4490 },
  BUR: { name: 'Burbank',    city: 'Burbank, CA',     lat: 34.1808, lon: -118.3089 },
  LAX: { name: 'Los Angeles', city: 'Los Angeles, CA', lat: 34.0560, lon: -118.2356 },
  SBA: { name: 'Santa Barbara', city: 'Santa Barbara, CA', lat: 34.4208, lon: -119.6982 },
  OXN: { name: 'Oxnard',     city: 'Oxnard, CA',      lat: 34.1958, lon: -119.1771 },
};

// Lat/lon for every Pacific Surfliner / Ventura County Line stop
export const STATION_COORDS = {
  GTA: [34.4369, -119.8276], // Goleta
  SBA: [34.4208, -119.6982], // Santa Barbara
  CPN: [34.3983, -119.5158], // Carpinteria
  VEC: [34.2756, -119.2929], // Ventura
  OXN: [34.1976, -119.1779], // Oxnard
  CML: [34.2175, -119.0380], // Camarillo
  MPK: [34.2838, -118.8820], // Moorpark
  SIM: [34.2694, -118.7811], // Simi Valley
  CWT: [34.2573, -118.5957], // Chatsworth
  NRG: [34.2313, -118.5389], // Northridge
  VNC: [34.1836, -118.4490], // Van Nuys
  BUR: [34.2008, -118.3585], // Burbank Airport
  BBK: [34.1808, -118.3089], // Burbank
  GDL: [34.1448, -118.2553], // Glendale
  LAX: [34.0560, -118.2356], // Los Angeles Union Station
  FUL: [33.8706, -117.9259], // Fullerton
  ANA: [33.8347, -117.9143], // Anaheim
  SNA: [33.7455, -117.8677], // Santa Ana
  IRV: [33.6847, -117.8192], // Irvine
  SNC: [33.5011, -117.6625], // San Juan Capistrano
  SNP: [33.4154, -117.6108], // San Clemente Pier
  OSD: [33.1956, -117.3819], // Oceanside
  SOL: [32.9901, -117.2582], // Solana Beach
  OLT: [32.7551, -117.1996], // San Diego Old Town
  SAN: [32.7137, -117.1751], // San Diego Santa Fe Depot
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
