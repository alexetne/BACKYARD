import { getDb } from "../../../../db";
import { distanceToRouteMeters, gpsOffRouteThresholdMeters } from "../../../../lib/geo";
import { getTrackingDevice } from "../../../../lib/tracking";
import type { GpxPoint } from "../../../../lib/types";

type IncomingPosition = {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  altitude?: number | null;
  speed?: number | null;
  heading?: number | null;
  recordedAt?: number;
};

export async function POST(request: Request) {
  try {
    const device = getTrackingDevice(request);
    if (!device) return Response.json({ error: "Appareil GPS non autorisé." }, { status: 401 });
    if (device.participantStatus !== "active") return Response.json({ error: "Le suivi est arrêté pour ce coureur." }, { status: 409 });
    const payload = await request.json() as { positions?: IncomingPosition[] };
    const incoming = Array.isArray(payload.positions) ? payload.positions.slice(0, 30) : [];
    const now = Date.now();
    const positions = incoming.map((position) => normalizePosition(position, now)).filter((position) => position !== null);
    if (!positions.length) return Response.json({ error: "Aucune position valide." }, { status: 400 });

    const db = getDb();
    const event = db.prepare("SELECT gpx_points FROM events WHERE id = ?").get(device.eventId) as { gpx_points: string } | undefined;
    const insert = db.prepare(`
      INSERT OR IGNORE INTO gps_positions (
        event_id, participant_id, device_id, latitude, longitude, accuracy_m,
        altitude_m, speed_mps, heading_deg, recorded_at, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.exec("BEGIN IMMEDIATE");
    let accepted = 0;
    try {
      for (const position of positions) {
        const result = insert.run(
          device.eventId, device.participantId, device.id,
          position.latitude, position.longitude, position.accuracy,
          position.altitude, position.speed, position.heading,
          position.recordedAt, now,
        );
        accepted += Number(result.changes);
      }
      db.prepare("UPDATE tracking_devices SET last_seen_at = ? WHERE id = ?").run(now, device.id);
      const retentionDays = Math.min(90, Math.max(1, Number(process.env.GPS_RETENTION_DAYS || 14)));
      db.prepare("DELETE FROM gps_positions WHERE received_at < ?").run(now - retentionDays * 24 * 60 * 60 * 1000);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    const latest = positions[positions.length - 1];
    const routePoints = event ? JSON.parse(event.gpx_points) as GpxPoint[] : [];
    const distanceFromRouteM = distanceToRouteMeters(latest.latitude, latest.longitude, routePoints);
    const thresholdM = gpsOffRouteThresholdMeters();
    return Response.json({
      accepted,
      receivedAt: now,
      route: distanceFromRouteM === null ? null : {
        distanceM: Math.round(distanceFromRouteM),
        thresholdM,
        offRoute: distanceFromRouteM - latest.accuracy > thresholdM,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Synchronisation impossible." }, { status: 500 });
  }
}

function normalizePosition(position: IncomingPosition, now: number) {
  const latitude = Number(position.latitude);
  const longitude = Number(position.longitude);
  const accuracy = Number(position.accuracy);
  const recordedAt = Number(position.recordedAt);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 10_000) return null;
  if (!Number.isFinite(recordedAt) || recordedAt < now - 12 * 60 * 60 * 1000 || recordedAt > now + 5 * 60 * 1000) return null;
  return {
    latitude, longitude, accuracy, recordedAt,
    altitude: optionalNumber(position.altitude, -1000, 10_000),
    speed: optionalNumber(position.speed, 0, 100),
    heading: optionalNumber(position.heading, 0, 360),
  };
}

function optionalNumber(value: unknown, minimum: number, maximum: number) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}
