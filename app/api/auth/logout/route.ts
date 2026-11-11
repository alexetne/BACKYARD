import { deleteSession, expiredSessionCookie, SESSION_COOKIE } from "../../../../lib/auth";

export async function POST(request: Request) {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  deleteSession(token);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": expiredSessionCookie() } });
}

function readCookie(header: string | null, name: string) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}
