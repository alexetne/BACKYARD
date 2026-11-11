import {
  AuthError,
  createSession,
  getUserByEmail,
  hasUsers,
  publicUser,
  sessionCookie,
  verifyPassword,
} from "../../../../lib/auth";

export async function POST(request: Request) {
  try {
    if (!hasUsers()) throw new AuthError("La configuration initiale doit être terminée.", 428);
    const payload = await request.json() as { email?: string; password?: string };
    const user = getUserByEmail(payload.email ?? "");
    const password = payload.password ?? "";
    if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
      throw new AuthError("Adresse e-mail ou mot de passe incorrect.", 401);
    }
    if (user.account_status !== "active") {
      throw new AuthError(
        user.account_status === "disabled"
          ? "Ce compte est désactivé. Contacte la direction de course."
          : "Ce compte doit d’abord être activé avec le lien reçu par e-mail.",
        403,
      );
    }

    const session = createSession(user.id);
    return Response.json(
      { user: publicUser(user) },
      {
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": sessionCookie(session.token, session.expiresAt, request),
        },
      },
    );
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Connexion impossible." }, { status });
  }
}
