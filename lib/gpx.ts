import type { GpxPoint } from "./types";

export type ParsedGpx = {
  points: GpxPoint[];
  distanceKm: number;
  elevationGainM: number;
  minElevationM: number | null;
  maxElevationM: number | null;
};

export function parseGpx(gpx: string): ParsedGpx {
  if (!gpx.trim()) throw new Error("Le fichier GPX est vide.");
  if (gpx.length > 2_000_000) throw new Error("Le fichier GPX dépasse la limite de 2 Mo.");

  const trackPoints = extractPoints(gpx, "trkpt");
  const points = trackPoints.length >= 2 ? trackPoints : extractPoints(gpx, "rtept");

  if (points.length < 2) throw new Error("Le GPX doit contenir au moins deux points de trace ou de route.");

  const simplified = simplify(points, 800);
  let distanceKm = 0;
  let elevationGainM = 0;
  const elevations = points.flatMap((point) => point.ele === null ? [] : [point.ele]);

  for (let index = 1; index < points.length; index += 1) {
    distanceKm += haversineKm(points[index - 1], points[index]);
    const previousElevation = points[index - 1].ele;
    const elevation = points[index].ele;
    if (previousElevation !== null && elevation !== null && elevation > previousElevation) {
      elevationGainM += elevation - previousElevation;
    }
  }

  return {
    points: simplified,
    distanceKm,
    elevationGainM,
    minElevationM: elevations.length ? Math.min(...elevations) : null,
    maxElevationM: elevations.length ? Math.max(...elevations) : null,
  };
}

function extractPoints(gpx: string, tag: "trkpt" | "rtept") {
  const points: GpxPoint[] = [];
  const pointPattern = new RegExp(
    `<(?:[\\w-]+:)?${tag}\\b([^>]*)>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`,
    "gi",
  );
  let match: RegExpExecArray | null;

  while ((match = pointPattern.exec(gpx)) !== null) {
    const lat = Number(match[1].match(/\blat=["']([^"']+)["']/i)?.[1]);
    const lon = Number(match[1].match(/\blon=["']([^"']+)["']/i)?.[1]);
    const elevationValue = match[2].match(/<(?:[\w-]+:)?ele>([^<]+)<\/(?:[\w-]+:)?ele>/i)?.[1];
    const ele = elevationValue === undefined ? null : Number(elevationValue);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      points.push({ lat, lon, ele: ele !== null && Number.isFinite(ele) ? ele : null });
    }
  }
  return points;
}

function simplify(points: GpxPoint[], limit: number) {
  if (points.length <= limit) return points;
  const result: GpxPoint[] = [];
  const step = (points.length - 1) / (limit - 1);
  for (let index = 0; index < limit; index += 1) {
    result.push(points[Math.round(index * step)]);
  }
  return result;
}

function haversineKm(a: GpxPoint, b: GpxPoint) {
  const toRadians = (value: number) => value * Math.PI / 180;
  const earthRadiusKm = 6371;
  const latDelta = toRadians(b.lat - a.lat);
  const lonDelta = toRadians(b.lon - a.lon);
  const firstLat = toRadians(a.lat);
  const secondLat = toRadians(b.lat);
  const value = Math.sin(latDelta / 2) ** 2
    + Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(lonDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}
