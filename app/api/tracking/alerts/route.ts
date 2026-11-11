import { getDb } from "../../../../db";
import { AuthError, requireRequestRole } from "../../../../lib/auth";
import { getTrackingDevice } from "../../../../lib/tracking";

type AlertKind = "assistance" | "urgent";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("mine") === "1") {
      const device = getTrackingDevice(request);
      if (!device) return Response.json({ error: "Appareil GPS non autorisé." }, { status: 401 });
      const alerts = getDb().prepare(`
        SELECT id, kind, message, status, created_at, acknowledged_at, resolved_at
        FROM tracking_alerts
        WHERE event_id = ? AND participant_id = ?
        ORDER BY created_at DESC LIMIT 5
      `).all(device.eventId, device.participantId);
      return Response.json({ alerts }, { headers: { "Cache-Control": "no-store" } });
    }
    requireRequestRole(request, ["director"]);
    const eventId = Number(url.searchParams.get("eventId"));
    if (!Number.isInteger(eventId)) throw new AuthError("Événement invalide.", 400);
    const alerts = getDb().prepare(`
      SELECT ta.id, ta.kind, ta.message, ta.latitude, ta.longitude, ta.status,
             ta.created_at, ta.acknowledged_at, ta.resolved_at,
             p.id AS participant_id, p.name AS runner_name, p.bib,
             acknowledged.name AS acknowledged_by_name,
             resolved.name AS resolved_by_name
      FROM tracking_alerts ta
      JOIN participants p ON p.id = ta.participant_id
      LEFT JOIN users acknowledged ON acknowledged.id = ta.acknowledged_by
      LEFT JOIN users resolved ON resolved.id = ta.resolved_by
      WHERE ta.event_id = ?
      ORDER BY CASE ta.status WHEN 'open' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END,
               CASE ta.kind WHEN 'urgent' THEN 0 ELSE 1 END,
               ta.created_at DESC
      LIMIT 100
    `).all(eventId);
    return Response.json({ alerts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Alertes indisponibles." }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const device = getTrackingDevice(request);
    if (!device) return Response.json({ error: "Appareil GPS non autorisé." }, { status: 401 });
    if (device.participantStatus !== "active") return Response.json({ error: "Le coureur n’est plus en course." }, { status: 409 });
    const payload = await request.json() as { kind?: AlertKind; message?: string };
    if (payload.kind !== "assistance" && payload.kind !== "urgent") {
      return Response.json({ error: "Type d’alerte invalide." }, { status: 400 });
    }
    const message = typeof payload.message === "string" ? payload.message.trim().slice(0, 240) : "";
    const db = getDb();
    const now = Date.now();
    const duplicate = db.prepare(`
      SELECT id FROM tracking_alerts
      WHERE event_id = ? AND participant_id = ? AND kind = ?
        AND status != 'resolved' AND created_at >= ?
      LIMIT 1
    `).get(device.eventId, device.participantId, payload.kind, now - 2 * 60 * 1000);
    if (duplicate) return Response.json({ error: "Cette alerte a déjà été envoyée. La direction la voit en direct." }, { status: 409 });

    const position = db.prepare(`
      SELECT latitude, longitude FROM gps_positions
      WHERE event_id = ? AND participant_id = ?
      ORDER BY recorded_at DESC, id DESC LIMIT 1
    `).get(device.eventId, device.participantId) as { latitude: number; longitude: number } | undefined;
    const result = db.prepare(`
      INSERT INTO tracking_alerts (
        event_id, participant_id, device_id, kind, message,
        latitude, longitude, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
    `).run(
      device.eventId, device.participantId, device.id, payload.kind, message,
      position?.latitude ?? null, position?.longitude ?? null, now,
    );
    return Response.json({
      alert: { id: Number(result.lastInsertRowid), kind: payload.kind, message, status: "open", created_at: now, acknowledged_at: null, resolved_at: null },
    }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Alerte non envoyée." }, { status: 500 });
  }
}
