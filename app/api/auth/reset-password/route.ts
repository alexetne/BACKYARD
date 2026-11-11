import { getDb } from "../../../../db";
import {
  AuthError,
  consumePasswordToken,
  createSession,
  getPasswordToken,
  publicUser,
  sessionCookie,
} from "../../../../lib/auth";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const entry = getPasswordToken(token);
  if (!entry) return Response.json({ valid: false, error: "Ce lien est invalide ou a expiré." }, { status: 400 });
  return Response.json({ valid: true, name: entry.name, purpose: entry.purpose, expiresAt: entry.expires_at });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { token?: string; password?: string };
    const entry = consumePasswordToken(payload.token ?? "", payload.password ?? "");
    const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(entry.user_id) as Parameters<typeof publicUser>[0];
    const session = createSession(entry.user_id);
    return Response.json(
      { user: publicUser(row) },
      { headers: { "Set-Cookie": sessionCookie(session.token, session.expiresAt, request) } },
    );
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Réinitialisation impossible." }, { status });
  }
}
