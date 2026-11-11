import { getDb } from "../../../db";

export const dynamic = "force-dynamic";

export async function GET() {
  const checkedAt = new Date().toISOString();
  try {
    const db = getDb();
    db.prepare("SELECT 1 AS ok").get();
    const active = db.prepare("SELECT id, status FROM events WHERE is_active = 1 LIMIT 1").get() as {
      id: number; status: string;
    } | undefined;
    return Response.json({
      status: "ok",
      database: "ok",
      activeEvent: active ? { id: active.id, status: active.status } : null,
      checkedAt,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "error", database: "unavailable", checkedAt }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
