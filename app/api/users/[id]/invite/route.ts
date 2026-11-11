import { getDb } from "../../../../../db";
import { AuthError, createPasswordToken, requireRequestRole } from "../../../../../lib/auth";
import { accountLink, sendAccountMail } from "../../../../../lib/mail";
import { ensureRunnerProfile } from "../../../../../lib/runner-profile";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const director = requireRequestRole(request, ["director"]);
    const { id: rawId } = await context.params;
    const userId = Number(rawId);
    if (!Number.isInteger(userId)) throw new AuthError("Compte invalide.", 400);
    const db = getDb();
    const user = db.prepare(`
      SELECT id, email, name, role, participant_id
      FROM users WHERE id = ?
    `).get(userId) as {
      id: number; email: string; name: string; role: string; participant_id: number | null;
    } | undefined;
    if (!user || user.role !== "runner" || !user.participant_id) {
      throw new AuthError("Ce compte coureur n’est pas rattaché à un participant.", 400);
    }

    ensureRunnerProfile(user.participant_id, user.id);
    const reset = createPasswordToken(user.id, "invite");
    const link = accountLink(request, reset.token);
    let result: Awaited<ReturnType<typeof sendAccountMail>>;
    try {
      result = await sendAccountMail({ to: user.email, name: user.name, link, purpose: "invite" });
    } catch (error) {
      db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL").run(user.id);
      throw error;
    }

    const now = Date.now();
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("UPDATE users SET account_status = 'invited', updated_at = ? WHERE id = ?").run(now, user.id);
      db.prepare(`
        UPDATE runner_profiles
        SET approved_at = ?, approved_by = ?, is_public = 1, updated_at = ?
        WHERE participant_id = ?
      `).run(now, director.id, now, user.participant_id);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return Response.json({
      message: result.delivered ? "Dossier validé et invitation envoyée." : "Dossier validé. SMTP absent : utilise le lien de test.",
      delivered: result.delivered,
      previewLink: result.previewLink,
      expiresAt: reset.expiresAt,
    });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Invitation impossible." }, { status });
  }
}
