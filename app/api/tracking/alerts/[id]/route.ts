import { getDb } from "../../../../../db";
import { AuthError, requireRequestRole } from "../../../../../lib/auth";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const director = requireRequestRole(request, ["director"]);
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    const payload = await request.json() as { action?: "acknowledge" | "resolve" };
    if (!Number.isInteger(id) || !["acknowledge", "resolve"].includes(payload.action || "")) {
      throw new AuthError("Action invalide.", 400);
    }
    const db = getDb();
    const alert = db.prepare("SELECT id, status FROM tracking_alerts WHERE id = ?").get(id) as { id: number; status: string } | undefined;
    if (!alert) throw new AuthError("Alerte introuvable.", 404);
    const now = Date.now();
    if (payload.action === "acknowledge" && alert.status === "open") {
      db.prepare(`
        UPDATE tracking_alerts
        SET status = 'acknowledged', acknowledged_at = ?, acknowledged_by = ?
        WHERE id = ?
      `).run(now, director.id, id);
    }
    if (payload.action === "resolve" && alert.status !== "resolved") {
      db.prepare(`
        UPDATE tracking_alerts
        SET status = 'resolved',
            acknowledged_at = COALESCE(acknowledged_at, ?),
            acknowledged_by = COALESCE(acknowledged_by, ?),
            resolved_at = ?, resolved_by = ?
        WHERE id = ?
      `).run(now, director.id, now, director.id, id);
    }
    const updated = db.prepare("SELECT id, status, acknowledged_at, resolved_at FROM tracking_alerts WHERE id = ?").get(id);
    return Response.json({ alert: updated });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Alerte non mise à jour." }, { status });
  }
}
