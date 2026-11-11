import { getDb } from "../../../db";
import { randomBytes } from "node:crypto";
import {
  AuthError,
  makePassword,
  normalizeEmail,
  requireRequestRole,
} from "../../../lib/auth";
import type { AuthUser, UserRole } from "../../../lib/types";
import { ensureRunnerProfile } from "../../../lib/runner-profile";

export async function GET(request: Request) {
  try {
    requireRequestRole(request, ["director"]);
    const rows = getDb().prepare(`
      SELECT u.id, u.email, u.name, u.role, u.participant_id, u.account_status,
             p.name AS participant_name, p.bib AS participant_bib,
             rp.slug AS profile_slug, rp.is_public AS profile_public,
             rp.approved_at AS profile_approved_at
      FROM users u
      LEFT JOIN participants p ON p.id = u.participant_id
      LEFT JOIN runner_profiles rp ON rp.user_id = u.id
      ORDER BY CASE u.role WHEN 'director' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, u.name
    `).all();
    return Response.json({ users: rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return authResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    requireRequestRole(request, ["director"]);
    const payload = await request.json() as {
      email?: string; name?: string; password?: string; role?: UserRole; participantId?: number | null;
    };
    const email = normalizeEmail(payload.email ?? "");
    const name = payload.name?.trim() ?? "";
    const role = payload.role;
    const participantId = role === "runner" ? Number(payload.participantId) : null;
    if (!name || !email.includes("@")) throw new AuthError("Nom et adresse e-mail valides requis.", 400);
    if (!role || !["runner", "admin", "director"].includes(role)) throw new AuthError("Rôle invalide.", 400);
    if (role === "runner" && !Number.isInteger(participantId)) {
      throw new AuthError("Un compte coureur doit être lié à un participant.", 400);
    }

    const db = getDb();
    if (role === "runner" && !db.prepare("SELECT id FROM participants WHERE id = ?").get(participantId)) {
      throw new AuthError("Participant introuvable.", 404);
    }
    const credentials = makePassword(role === "runner" ? randomBytes(32).toString("base64url") : payload.password ?? "");
    const now = Date.now();
    const result = db.prepare(`
      INSERT INTO users (
        email, name, password_hash, password_salt, role, participant_id,
        account_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(email, name, credentials.hash, credentials.salt, role, participantId, role === "runner" ? "pending" : "active", now, now);
    const userId = Number(result.lastInsertRowid);
    if (role === "runner" && participantId) ensureRunnerProfile(participantId, userId);
    const user: AuthUser = {
      id: userId, email, name, role, participantId,
      accountStatus: role === "runner" ? "pending" : "active",
    };
    return Response.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      return Response.json({ error: "Cette adresse e-mail ou ce coureur possède déjà un compte." }, { status: 409 });
    }
    return authResponse(error);
  }
}

function authResponse(error: unknown) {
  const status = error instanceof AuthError ? error.status : 500;
  return Response.json({ error: error instanceof Error ? error.message : "Opération impossible." }, { status });
}
