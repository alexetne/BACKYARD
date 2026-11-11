import { getDb } from "../../../../db";
import { getDashboardEvent } from "../../../../lib/dashboard-server";
import { AuthError, requireRequestRole } from "../../../../lib/auth";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireRequestRole(request, ["admin", "director"]);
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    const payload = await request.json() as { status?: "active" | "out" | "dns" };
    if (!Number.isInteger(id) || !payload.status || !["active", "out", "dns"].includes(payload.status)) {
      return Response.json({ error: "Mise à jour invalide." }, { status: 400 });
    }

    const db = getDb();
    const participant = db.prepare("SELECT id, event_id, name FROM participants WHERE id = ?").get(id) as {
      id: number; event_id: number; name: string;
    } | undefined;
    if (!participant) return Response.json({ error: "Participant introuvable." }, { status: 404 });

    db.prepare("UPDATE participants SET status = ? WHERE id = ?").run(payload.status, id);
    if (payload.status === "out") {
      const laps = db.prepare("SELECT COUNT(*) AS count FROM laps WHERE participant_id = ?").get(id) as { count: number };
      db.prepare(`
        INSERT INTO race_updates (event_id, type, title, detail, created_at)
        VALUES (?, 'out', ?, ?, ?)
      `).run(participant.event_id, `${participant.name} abandonne`, `Après ${laps.count} tour${laps.count > 1 ? "s" : ""}`, Date.now());
    }

    return Response.json({ event: getDashboardEvent(participant.event_id) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Mise à jour impossible." }, { status: error instanceof AuthError ? error.status : 500 });
  }
}
