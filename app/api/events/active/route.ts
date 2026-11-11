import { getDashboardEvent } from "../../../../lib/dashboard-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const event = getDashboardEvent();
    if (!event) return Response.json({ error: "Aucun événement actif." }, { status: 404 });
    return Response.json({ event }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Impossible de charger l'événement." },
      { status: 500 },
    );
  }
}
