import { getDb } from "../../../db";
import { getDashboardEvent } from "../../../lib/dashboard-server";
import { AuthError, requireRequestRole } from "../../../lib/auth";
import { ensureRunnerProfile } from "../../../lib/runner-profile";

export async function POST(request: Request) {
  try {
    requireRequestRole(request, ["admin", "director"]);
    const payload = await request.json() as { eventId?: number; bib?: number; name?: string; country?: string };
    const eventId = Number(payload.eventId);
    const bib = Number(payload.bib);
    const name = payload.name?.trim() ?? "";
    const country = (payload.country?.trim() || "FR").toUpperCase().slice(0, 3);
    if (!Number.isInteger(eventId) || !Number.isInteger(bib) || bib <= 0 || !name) {
      return Response.json({ error: "Événement, dossard et nom sont obligatoires." }, { status: 400 });
    }

    const db = getDb();
    const result = db.prepare(`
      INSERT INTO participants (event_id, bib, name, country, status, created_at)
      VALUES (?, ?, ?, ?, 'active', ?)
    `).run(eventId, bib, name, country, Date.now());
    db.prepare(`
      INSERT INTO race_updates (event_id, type, title, detail, created_at)
      VALUES (?, 'runner', ?, ?, ?)
    `).run(eventId, `${name} rejoint la course`, `Dossard #${bib}`, Date.now());
    ensureRunnerProfile(Number(result.lastInsertRowid));

    return Response.json({ participantId: Number(result.lastInsertRowid), event: getDashboardEvent(eventId) }, { status: 201 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Ajout impossible.";
    const duplicate = detail.includes("UNIQUE constraint failed");
    return Response.json({ error: duplicate ? "Ce dossard est déjà utilisé pour cet événement." : detail }, { status: error instanceof AuthError ? error.status : duplicate ? 409 : 500 });
  }
}
