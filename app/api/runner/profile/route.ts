import { AuthError, requireRequestRole } from "../../../../lib/auth";
import {
  getEditableRunnerProfile,
  normalizeProfileInput,
  updateRunnerProfile,
} from "../../../../lib/runner-profile";
import type { RunnerProfileFields } from "../../../../lib/types";

export async function PATCH(request: Request) {
  try {
    const user = requireRequestRole(request, ["runner"]);
    if (!user.participantId) throw new AuthError("Aucun participant n’est lié à ce compte.", 400);
    const current = getEditableRunnerProfile(user.participantId);
    const payload = await request.json() as Partial<RunnerProfileFields>;
    const fields = normalizeProfileInput({ ...current, ...payload });
    updateRunnerProfile(user.participantId, fields);
    return Response.json({ profile: getEditableRunnerProfile(user.participantId) });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Profil impossible à enregistrer." }, { status });
  }
}
