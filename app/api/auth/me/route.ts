import { getRequestUser, hasUsers } from "../../../../lib/auth";

export async function GET(request: Request) {
  if (!hasUsers()) return Response.json({ needsSetup: true, user: null }, { status: 428 });
  const user = getRequestUser(request);
  if (!user) return Response.json({ user: null }, { status: 401 });
  return Response.json({ user }, { headers: { "Cache-Control": "no-store" } });
}
