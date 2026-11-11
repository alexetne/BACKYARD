import { getDb } from "../../../../../db";
import { getDashboardEvent } from "../../../../../lib/dashboard-server";
import { AuthError, requireRequestRole } from "../../../../../lib/auth";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireRequestRole(request, ["director"]);
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isInteger(id)) return Response.json({ error: "Événement invalide." }, { status: 400 });

    const db = getDb();
    const exists = db.prepare("SELECT id FROM events WHERE id = ?").get(id);
    if (!exists) return Response.json({ error: "Événement introuvable." }, { status: 404 });

    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("UPDATE events SET is_active = 0 WHERE is_active = 1").run();
      db.prepare("UPDATE events SET is_active = 1 WHERE id = ?").run(id);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return Response.json({ event: getDashboardEvent(id) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Activation impossible." }, { status: error instanceof AuthError ? error.status : 500 });
  }
}
