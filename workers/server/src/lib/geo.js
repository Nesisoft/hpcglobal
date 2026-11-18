/**
 * Is a phone at the venue?
 *
 * Distance by the haversine formula, as the old app did. Phones indoors often
 * report a fix tens of metres out and say so (the reported accuracy), so up to
 * 50 m of that is added to the venue's radius: a worker standing inside the
 * church isn't turned away because the roof weakened the signal, but a fix
 * claiming to be accurate to a kilometre buys no more than 50 m.
 *
 * The position comes from the phone and can be faked by a determined person —
 * true of any GPS check in a web app. The QR code shown at church is the
 * stronger check, and every record says which method was used.
 */

const EARTH_RADIUS_M = 6371000;
const MAX_ACCURACY_ALLOWANCE_M = 50;

const rad = (deg) => (deg * Math.PI) / 180;

function distanceM(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * @returns {{ ok: boolean, distanceM: number, allowedM: number }}
 */
function atVenue(service, { latitude, longitude, accuracy }) {
  const d = Math.round(distanceM(latitude, longitude, service.latitude, service.longitude));
  const slack = Math.min(Math.max(Number(accuracy) || 0, 0), MAX_ACCURACY_ALLOWANCE_M);
  const allowedM = service.radiusM + Math.round(slack);
  return { ok: d <= allowedM, distanceM: d, allowedM };
}

const hasLocation = (service) => service.latitude != null && service.longitude != null;

module.exports = { distanceM, atVenue, hasLocation, MAX_ACCURACY_ALLOWANCE_M };
