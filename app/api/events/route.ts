import { getDb } from "../../../db";
import { getDashboardEvent, listEvents } from "../../../lib/dashboard-server";
import { parseGpx } from "../../../lib/gpx";
import { AuthError, requireRequestRole } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    requireRequestRole(request, ["director"]);
    return Response.json({ events: listEvents() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: error instanceof AuthError ? error.status : 500 });
  }
}

export async function POST(request: Request) {
  try {
    requireRequestRole(request, ["director"]);
    const payload = await request.json() as {
      name?: string;
      location?: string;
      startAt?: string | number;
      loopDistanceKm?: number;
      totalLoops?: number | null;
      gpxName?: string;
      gpxText?: string;
    };

    const name = payload.name?.trim() ?? "";
    const location = payload.location?.trim() ?? "";
    const startAt = typeof payload.startAt === "number" ? payload.startAt : Date.parse(payload.startAt ?? "");
    const loopDistanceKm = Number(payload.loopDistanceKm);
    const totalLoops = payload.totalLoops === null || payload.totalLoops === undefined
      ? null
      : Number(payload.totalLoops);

    if (!name || !location) return Response.json({ error: "Le nom et le lieu sont obligatoires." }, { status: 400 });
    if (!Number.isFinite(startAt)) return Response.json({ error: "La date de départ est invalide." }, { status: 400 });
    if (!Number.isFinite(loopDistanceKm) || loopDistanceKm <= 0) {
      return Response.json({ error: "La distance de boucle doit être supérieure à zéro." }, { status: 400 });
    }
    if (totalLoops !== null && (!Number.isInteger(totalLoops) || totalLoops <= 0)) {
      return Response.json({ error: "Le nombre de boucles doit être un entier positif ou infini." }, { status: 400 });
    }

    const parsedGpx = parseGpx(payload.gpxText ?? "");
    const db = getDb();
    const now = Date.now();
    db.exec("BEGIN IMMEDIATE");
    let eventId: number;
    try {
      db.prepare("UPDATE events SET is_active = 0 WHERE is_active = 1").run();
      const result = db.prepare(`
        INSERT INTO events (
          name, location, start_at, loop_distance_km, total_loops, gpx_name,
          gpx_xml, gpx_points, route_distance_km, elevation_gain_m,
          min_elevation_m, max_elevation_m, is_active, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'live', ?)
      `).run(
        name, location, startAt, loopDistanceKm, totalLoops,
        payload.gpxName?.trim() || "parcours.gpx", payload.gpxText ?? "",
        JSON.stringify(parsedGpx.points), parsedGpx.distanceKm, parsedGpx.elevationGainM,
        parsedGpx.minElevationM, parsedGpx.maxElevationM, now,
      );
      eventId = Number(result.lastInsertRowid);
      db.prepare(`
        INSERT INTO race_updates (event_id, type, title, detail, created_at)
        VALUES (?, 'event', ?, ?, ?)
      `).run(eventId, "Événement créé", `${loopDistanceKm.toLocaleString("fr-FR")} km par boucle`, now);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return Response.json({ event: getDashboardEvent(eventId) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: error instanceof AuthError ? error.status : 400 });
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Une erreur est survenue.";
}
