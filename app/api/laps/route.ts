import { getDb } from "../../../db";
import { getDashboardEvent } from "../../../lib/dashboard-server";
import { AuthError, requireRequestRole } from "../../../lib/auth";

export async function POST(request: Request) {
  try {
    requireRequestRole(request, ["admin", "director"]);
    const payload = await request.json() as { participantId?: number; durationSeconds?: number };
    const participantId = Number(payload.participantId);
    if (!Number.isInteger(participantId)) return Response.json({ error: "Participant invalide." }, { status: 400 });

    const db = getDb();
    const participant = db.prepare(`
      SELECT p.id, p.event_id, p.name, p.status, e.start_at, e.loop_distance_km
      FROM participants p JOIN events e ON e.id = p.event_id
      WHERE p.id = ?
    `).get(participantId) as {
      id: number; event_id: number; name: string; status: string; start_at: number; loop_distance_km: number;
    } | undefined;
    if (!participant) return Response.json({ error: "Participant introuvable." }, { status: 404 });
    if (participant.status !== "active") return Response.json({ error: "Ce participant n'est plus en course." }, { status: 409 });

    const countRow = db.prepare("SELECT COUNT(*) AS count FROM laps WHERE participant_id = ?").get(participantId) as { count: number };
    const lapNumber = Number(countRow.count) + 1;
    const startedAt = participant.start_at + (lapNumber - 1) * 3_600_000;
    const now = Date.now();
    const measuredDuration = Math.floor((now - startedAt) / 1000);
    const requestedDuration = Number(payload.durationSeconds);
    const durationSeconds = Number.isFinite(requestedDuration)
      ? Math.round(requestedDuration)
      : measuredDuration;

    if (durationSeconds <= 0 || durationSeconds >= 3600) {
      return Response.json({ error: "Le temps du tour doit être compris entre 1 seconde et 59:59." }, { status: 400 });
    }

    const finishedAt = startedAt + durationSeconds * 1000;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare(`
        INSERT INTO laps (event_id, participant_id, lap_number, started_at, finished_at, duration_seconds, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(participant.event_id, participantId, lapNumber, startedAt, finishedAt, durationSeconds, now);
      db.prepare(`
        INSERT INTO race_updates (event_id, type, title, detail, created_at)
        VALUES (?, 'lap', ?, ?, ?)
      `).run(
        participant.event_id,
        `${participant.name} boucle le tour`,
        `Tour ${lapNumber} · ${formatDuration(durationSeconds)}`,
        now,
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return Response.json({ event: getDashboardEvent(participant.event_id) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Tour non enregistré." }, { status: error instanceof AuthError ? error.status : 500 });
  }
}

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
