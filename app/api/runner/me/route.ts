import { getDb } from "../../../../db";
import { AuthError, requireRequestRole } from "../../../../lib/auth";
import { getEditableRunnerProfile } from "../../../../lib/runner-profile";

export async function GET(request: Request) {
  try {
    const user = requireRequestRole(request, ["runner"]);
    if (!user.participantId) return Response.json({ user, runner: null });
    const db = getDb();
    const runner = db.prepare(`
      SELECT p.id, p.name, p.bib, p.country, p.status, e.id AS event_id,
             e.name AS event_name, e.location, e.start_at, e.loop_distance_km,
             e.total_loops, e.gpx_name
      FROM participants p JOIN events e ON e.id = p.event_id
      WHERE p.id = ?
    `).get(user.participantId);
    if (!runner) return Response.json({ user, runner: null });
    const laps = db.prepare(`
      SELECT lap_number, started_at, finished_at, duration_seconds
      FROM laps WHERE participant_id = ? ORDER BY lap_number DESC
    `).all(user.participantId);
    const profile = getEditableRunnerProfile(user.participantId);
    return Response.json({ user, runner, laps, profile }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Données indisponibles." }, { status });
  }
}
