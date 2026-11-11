import { getDb } from "../../../../db";
import { createPasswordToken, getUserByEmail } from "../../../../lib/auth";
import { accountLink, sendAccountMail } from "../../../../lib/mail";

export async function POST(request: Request) {
  const generic = { message: "Si ce compte existe et peut être réinitialisé, un e-mail vient d’être envoyé." };
  try {
    const payload = await request.json() as { email?: string };
    const user = getUserByEmail(payload.email ?? "");
    if (!user || user.account_status === "pending" || user.account_status === "disabled") {
      return Response.json(generic);
    }
    const reset = createPasswordToken(user.id, "reset");
    const link = accountLink(request, reset.token);
    try {
      await sendAccountMail({ to: user.email, name: user.name, link, purpose: "reset" });
    } catch (error) {
      getDb().prepare("DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL").run(user.id);
      console.error("Password reset e-mail failed", error);
    }
    return Response.json(generic);
  } catch {
    return Response.json(generic);
  }
}
