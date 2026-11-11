import type { GpxPoint } from "./types";

export function gpsOffRouteThresholdMeters() {
  const configured = Number(process.env.GPS_OFF_ROUTE_THRESHOLD_M || 200);
  return Math.min(2_000, Math.max(50, Number.isFinite(configured) ? configured : 200));
}

export function distanceToRouteMeters(latitude: number, longitude: number, route: GpxPoint[]) {
  if (!route.length) return null;
  if (route.length === 1) return haversineMeters(latitude, longitude, route[0].lat, route[0].lon);

  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < route.length; index += 1) {
    minimum = Math.min(minimum, distanceToSegmentMeters(latitude, longitude, route[index - 1], route[index]));
  }
  return Number.isFinite(minimum) ? minimum : null;
}

function distanceToSegmentMeters(latitude: number, longitude: number, start: GpxPoint, end: GpxPoint) {
  const referenceLatitude = toRadians((latitude + start.lat + end.lat) / 3);
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLon = 111_320 * Math.cos(referenceLatitude);
  const pointX = (longitude - start.lon) * metersPerDegreeLon;
  const pointY = (latitude - start.lat) * metersPerDegreeLat;
  const endX = (end.lon - start.lon) * metersPerDegreeLon;
  const endY = (end.lat - start.lat) * metersPerDegreeLat;
  const squaredLength = endX * endX + endY * endY;
  if (squaredLength === 0) return Math.hypot(pointX, pointY);
  const ratio = Math.max(0, Math.min(1, (pointX * endX + pointY * endY) / squaredLength));
  return Math.hypot(pointX - ratio * endX, pointY - ratio * endY);
}

function haversineMeters(firstLat: number, firstLon: number, secondLat: number, secondLon: number) {
  const earthRadiusMeters = 6_371_000;
  const latDelta = toRadians(secondLat - firstLat);
  const lonDelta = toRadians(secondLon - firstLon);
  const value = Math.sin(latDelta / 2) ** 2
    + Math.cos(toRadians(firstLat)) * Math.cos(toRadians(secondLat)) * Math.sin(lonDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function toRadians(value: number) {
  return value * Math.PI / 180;
}
