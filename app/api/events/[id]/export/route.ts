import { getDb } from "../../../../../db";
import { AuthError, requireRequestRole } from "../../../../../lib/auth";

type ExportType = "results" | "laps" | "gps" | "alerts";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireRequestRole(request, ["admin", "director"]);
    const { id: rawId } = await context.params;
    const eventId = Number(rawId);
    const type = (new URL(request.url).searchParams.get("type") || "results") as ExportType;
    if (!Number.isInteger(eventId) || !["results", "laps", "gps", "alerts"].includes(type)) {
      throw new AuthError("Export invalide.", 400);
    }
    const db = getDb();
    const event = db.prepare("SELECT id, name, loop_distance_km FROM events WHERE id = ?").get(eventId) as {
      id: number; name: string; loop_distance_km: number;
    } | undefined;
    if (!event) throw new AuthError("Événement introuvable.", 404);

    const csv = type === "results"
      ? resultsCsv(eventId, event.loop_distance_km)
      : type === "laps"
        ? lapsCsv(eventId)
        : type === "gps"
          ? gpsCsv(eventId)
          : alertsCsv(eventId);
    const filename = `last-loop-event-${eventId}-${type}.csv`;
    return new Response(`\uFEFF${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Export impossible." }, { status });
  }
}

function resultsCsv(eventId: number, loopDistanceKm: number) {
  const rows = getDb().prepare(`
    SELECT p.bib, p.name, p.country, p.status,
           COUNT(l.id) AS laps,
           MIN(l.duration_seconds) AS best_lap_seconds,
           MAX(l.finished_at) AS last_finish_at
    FROM participants p
    LEFT JOIN laps l ON l.participant_id = p.id
    WHERE p.event_id = ?
    GROUP BY p.id
    ORDER BY laps DESC, last_finish_at ASC, p.bib ASC
  `).all(eventId) as unknown as Array<Record<string, unknown> & { laps: number }>;
  return toCsv(
    ["Dossard", "Nom", "Pays", "Statut", "Boucles", "Distance_km", "Meilleur_tour_s", "Derniere_arrivee"],
    rows.map((row) => [
      row.bib, row.name, row.country, row.status, row.laps,
      (Number(row.laps) * loopDistanceKm).toFixed(3), row.best_lap_seconds,
      isoDate(row.last_finish_at),
    ]),
  );
}

function lapsCsv(eventId: number) {
  const rows = getDb().prepare(`
    SELECT p.bib, p.name, l.lap_number, l.started_at, l.finished_at, l.duration_seconds
    FROM laps l JOIN participants p ON p.id = l.participant_id
    WHERE l.event_id = ?
    ORDER BY l.lap_number, l.finished_at, p.bib
  `).all(eventId) as unknown as Array<Record<string, unknown>>;
  return toCsv(
    ["Dossard", "Nom", "Boucle", "Depart", "Arrivee", "Duree_secondes"],
    rows.map((row) => [row.bib, row.name, row.lap_number, isoDate(row.started_at), isoDate(row.finished_at), row.duration_seconds]),
  );
}

function gpsCsv(eventId: number) {
  const rows = getDb().prepare(`
    SELECT p.bib, p.name, gp.latitude, gp.longitude, gp.accuracy_m,
           gp.altitude_m, gp.speed_mps, gp.heading_deg, gp.recorded_at, gp.received_at
    FROM gps_positions gp JOIN participants p ON p.id = gp.participant_id
    WHERE gp.event_id = ?
    ORDER BY gp.recorded_at, p.bib
  `).all(eventId) as unknown as Array<Record<string, unknown>>;
  return toCsv(
    ["Dossard", "Nom", "Latitude", "Longitude", "Precision_m", "Altitude_m", "Vitesse_m_s", "Cap_deg", "Date_GPS", "Date_reception"],
    rows.map((row) => [
      row.bib, row.name, row.latitude, row.longitude, row.accuracy_m,
      row.altitude_m, row.speed_mps, row.heading_deg, isoDate(row.recorded_at), isoDate(row.received_at),
    ]),
  );
}

function alertsCsv(eventId: number) {
  const rows = getDb().prepare(`
    SELECT p.bib, p.name, ta.kind, ta.message, ta.status, ta.latitude, ta.longitude,
           ta.created_at, ta.acknowledged_at, ta.resolved_at
    FROM tracking_alerts ta JOIN participants p ON p.id = ta.participant_id
    WHERE ta.event_id = ?
    ORDER BY ta.created_at
  `).all(eventId) as unknown as Array<Record<string, unknown>>;
  return toCsv(
    ["Dossard", "Nom", "Type", "Message", "Statut", "Latitude", "Longitude", "Creation", "Acquittement", "Resolution"],
    rows.map((row) => [
      row.bib, row.name, row.kind, row.message, row.status, row.latitude, row.longitude,
      isoDate(row.created_at), isoDate(row.acknowledged_at), isoDate(row.resolved_at),
    ]),
  );
}

function toCsv(headers: string[], rows: unknown[][]) {
  return [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  let text = String(value).replace(/\r?\n/g, " ");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function isoDate(value: unknown) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : "";
}
