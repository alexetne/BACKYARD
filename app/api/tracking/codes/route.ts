import { getDb } from "../../../../db";
import { AuthError, requireRequestRole } from "../../../../lib/auth";
import { distanceToRouteMeters, gpsOffRouteThresholdMeters } from "../../../../lib/geo";
import { generateTrackingCode } from "../../../../lib/tracking";
import type { GpxPoint } from "../../../../lib/types";

export async function GET(request: Request) {
  try {
    requireRequestRole(request, ["director"]);
    const eventId = Number(new URL(request.url).searchParams.get("eventId"));
    if (!Number.isInteger(eventId)) throw new AuthError("Événement invalide.", 400);
    const db = getDb();
    const event = db.prepare("SELECT gpx_points FROM events WHERE id = ?").get(eventId) as { gpx_points: string } | undefined;
    if (!event) throw new AuthError("Événement introuvable.", 404);
    const route = JSON.parse(event.gpx_points) as GpxPoint[];
    const thresholdM = gpsOffRouteThresholdMeters();
    const rows = db.prepare(`
      SELECT p.id, p.bib, p.name, p.status,
             tc.code_hint, tc.expires_at AS code_expires_at,
             (SELECT MAX(last_seen_at) FROM tracking_devices td
              WHERE td.participant_id = p.id AND td.event_id = p.event_id AND td.revoked_at IS NULL) AS last_seen_at,
             gp.recorded_at AS last_position_at,
             gp.latitude, gp.longitude, gp.accuracy_m
      FROM participants p
      LEFT JOIN tracking_codes tc ON tc.participant_id = p.id AND tc.event_id = p.event_id
      LEFT JOIN gps_positions gp ON gp.id = (
        SELECT latest.id FROM gps_positions latest
        WHERE latest.participant_id = p.id AND latest.event_id = p.event_id
        ORDER BY latest.recorded_at DESC, latest.id DESC LIMIT 1
      )
      WHERE p.event_id = ?
      ORDER BY p.bib
    `).all(eventId) as unknown as Array<{
      id: number; bib: number; name: string; status: string; code_hint: string | null;
      code_expires_at: number | null; last_seen_at: number | null; last_position_at: number | null;
      latitude: number | null; longitude: number | null; accuracy_m: number | null;
    }>;
    return Response.json({
      runners: rows.map((row) => {
        const distance = row.latitude === null || row.longitude === null
          ? null
          : distanceToRouteMeters(row.latitude, row.longitude, route);
        return {
          ...row,
          distance_from_route_m: distance === null ? null : Math.round(distance),
          off_route: distance !== null && distance - Number(row.accuracy_m || 0) > thresholdM,
        };
      }),
      offRouteThresholdM: thresholdM,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Codes indisponibles." }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const director = requireRequestRole(request, ["director"]);
    const payload = await request.json() as { eventId?: number; participantId?: number };
    const eventId = Number(payload.eventId);
    const participantId = Number(payload.participantId);
    if (!Number.isInteger(eventId) || !Number.isInteger(participantId)) throw new AuthError("Événement ou coureur invalide.", 400);
    const generated = generateTrackingCode(eventId, participantId, director.id);
    return Response.json(generated, { status: 201 });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Génération impossible." }, { status });
  }
}
