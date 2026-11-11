import { getDb } from "../../../../db";
import {
  AuthError,
  createSession,
  hasUsers,
  makePassword,
  normalizeEmail,
  publicUser,
  sessionCookie,
} from "../../../../lib/auth";

export async function GET() {
  return Response.json({ needsSetup: !hasUsers() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { name?: string; email?: string; password?: string };
    const name = payload.name?.trim() ?? "";
    const email = normalizeEmail(payload.email ?? "");
    const password = payload.password ?? "";
    if (!name || !email.includes("@")) throw new AuthError("Nom et adresse e-mail valides requis.", 400);
    const credentials = makePassword(password);
    const db = getDb();

    db.exec("BEGIN IMMEDIATE");
    let userId: number;
    try {
      const existing = db.prepare("SELECT EXISTS(SELECT 1 FROM users) AS present").get() as { present: number };
      if (existing.present === 1) throw new AuthError("La configuration initiale est déjà terminée.", 409);
      const result = db.prepare(`
        INSERT INTO users (email, name, password_hash, password_salt, role, participant_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'director', NULL, ?, ?)
      `).run(email, name, credentials.hash, credentials.salt, Date.now(), Date.now());
      userId = Number(result.lastInsertRowid);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    const session = createSession(userId);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as Parameters<typeof publicUser>[0];
    return Response.json(
      { user: publicUser(user) },
      { status: 201, headers: { "Set-Cookie": sessionCookie(session.token, session.expiresAt) } },
    );
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Configuration impossible." }, { status });
  }
}
