const db = require('../db');

// Approximate center coordinates for Kenyan counties, major towns + common aliases.
// Used to convert a county/town name from the AI into lat/lng for distance queries.
const DISTRICT_COORDS = {
  // Nairobi
  'nairobi':      { lat: -1.2921, lng: 36.8219 },
  'westlands':    { lat: -1.2670, lng: 36.8060 },
  'dagoretti':    { lat: -1.3186, lng: 36.7698 },
  'embakasi':     { lat: -1.3226, lng: 36.8894 },
  'kasarani':     { lat: -1.2210, lng: 36.8970 },
  'langata':      { lat: -1.3667, lng: 36.7500 },
  'lang\'ata':    { lat: -1.3667, lng: 36.7500 }, // alias
  'karen':        { lat: -1.3300, lng: 36.7100 },
  'kibera':       { lat: -1.3133, lng: 36.7892 },
  // Central
  'kiambu':       { lat: -1.1714, lng: 36.8356 },
  'thika':        { lat: -1.0396, lng: 37.0900 },
  'ruiru':        { lat: -1.1500, lng: 36.9600 },
  'murang\'a':    { lat: -0.7167, lng: 37.1500 },
  'muranga':      { lat: -0.7167, lng: 37.1500 }, // alias
  'nyeri':        { lat: -0.4169, lng: 36.9517 },
  'nyahururu':    { lat: 0.0333,  lng: 36.3667 },
  'laikipia':     { lat: 0.0500,  lng: 36.8000 },
  'kirinyaga':    { lat: -0.5000, lng: 37.2833 },
  'kerugoya':     { lat: -0.5000, lng: 37.2833 }, // alias
  'embu':         { lat: -0.5310, lng: 37.4500 },
  // Rift Valley
  'nakuru':       { lat: -0.3031, lng: 36.0800 },
  'naivasha':     { lat: -0.7167, lng: 36.4333 },
  'eldoret':      { lat: 0.5143,  lng: 35.2698 },
  'uasin gishu':  { lat: 0.5200,  lng: 35.2700 },
  'kericho':      { lat: -0.3689, lng: 35.2831 },
  'bomet':        { lat: -0.7833, lng: 35.3333 },
  'narok':        { lat: -1.0833, lng: 35.8667 },
  'kajiado':      { lat: -1.8500, lng: 36.7833 },
  'nyandarua':    { lat: -0.3500, lng: 36.3667 },
  // Western
  'kakamega':     { lat: 0.2842,  lng: 34.7522 },
  'bungoma':      { lat: 0.5635,  lng: 34.5606 },
  'webuye':       { lat: 0.5635,  lng: 34.5606 }, // alias
  'busia':        { lat: 0.4600,  lng: 34.1100 },
  'vihiga':       { lat: 0.0500,  lng: 34.7167 },
  // Nyanza
  'kisumu':       { lat: -0.0917, lng: 34.7680 },
  'kisii':        { lat: -0.6817, lng: 34.7680 },
  'homa bay':     { lat: -0.5273, lng: 34.4571 },
  'homabay':      { lat: -0.5273, lng: 34.4571 }, // alias
  'migori':       { lat: -0.9167, lng: 34.4667 },
  'siaya':        { lat: 0.0617,  lng: 34.2883 },
  'nyamira':      { lat: -0.5667, lng: 34.9333 },
  // Coast
  'mombasa':      { lat: -4.0435, lng: 39.6682 },
  'kilifi':       { lat: -3.6300, lng: 39.8499 },
  'malindi':      { lat: -3.2192, lng: 40.1169 },
  'kwale':        { lat: -4.1737, lng: 39.4521 },
  'lamu':         { lat: -2.2717, lng: 40.9020 },
  'taita taveta': { lat: -3.3167, lng: 38.3667 },
  'taita':        { lat: -3.3167, lng: 38.3667 }, // alias
  'tana river':   { lat: -1.5000, lng: 39.9833 },
  // North Eastern
  'garissa':      { lat: -0.4536, lng: 39.6461 },
  'wajir':        { lat: 1.7471,  lng: 40.0573 },
  'mandera':      { lat: 3.9366,  lng: 41.8670 },
  'isiolo':       { lat: 0.3546,  lng: 37.5822 },
  'marsabit':     { lat: 2.3344,  lng: 37.9899 },
  // Eastern
  'machakos':     { lat: -1.5177, lng: 37.2634 },
  'kitui':        { lat: -1.3667, lng: 38.0167 },
  'meru':         { lat: 0.0500,  lng: 37.6500 },
  'tharaka nithi': { lat: -0.3000, lng: 37.9000 },
  'tharaka':      { lat: -0.3000, lng: 37.9000 }, // alias
};

/**
 * Resolve a location string (county, city, alias) to lat/lng.
 * Returns null if unknown.
 */
function resolveCoords(locationStr) {
  if (!locationStr) return null;
  const key = locationStr.toLowerCase().trim();
  return DISTRICT_COORDS[key] ?? null;
}

/**
 * Find the N nearest hospitals to a lat/lng point using Haversine distance.
 */
async function findNearest(lat, lng, limit = 3) {
  const { rows } = await db.query(
    `SELECT id, name, district, province, address, phone_number,
            specialties, is_emergency, latitude, longitude,
            6371 * acos(
              LEAST(1.0,
                cos(radians($1)) * cos(radians(latitude))
                  * cos(radians(longitude) - radians($2))
                + sin(radians($1)) * sin(radians(latitude))
              )
            ) AS distance_km
     FROM hospitals
     WHERE is_active = true
     ORDER BY distance_km ASC
     LIMIT $3`,
    [lat, lng, limit]
  );
  return rows;
}

/**
 * Find hospitals by district name (case-insensitive partial match).
 */
async function findByDistrict(district, limit = 3) {
  const { rows } = await db.query(
    `SELECT * FROM hospitals
     WHERE is_active = true
       AND (lower(district) ILIKE lower($1) OR lower(province) ILIKE lower($1))
     ORDER BY is_emergency DESC, name ASC
     LIMIT $2`,
    [`%${district}%`, limit]
  );
  return rows;
}

/**
 * Given a free-text location from the AI or Twilio (e.g. "Embakasi", "Nairobi"),
 * return the nearest hospitals. Falls back to district name search.
 */
async function findNearestByLocation(locationStr, limit = 3) {
  const coords = resolveCoords(locationStr);
  if (coords) return findNearest(coords.lat, coords.lng, limit);
  if (locationStr) return findByDistrict(locationStr, limit);
  return [];
}

module.exports = { findNearest, findByDistrict, findNearestByLocation, resolveCoords };
