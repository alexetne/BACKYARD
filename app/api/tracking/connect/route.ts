import { connectTrackingDevice, trackingCookie } from "../../../../lib/tracking";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { code?: string; client?: string };
    const code = typeof payload.code === "string" ? payload.code.slice(0, 32) : "";
    const connection = connectTrackingDevice(code);
    if (!connection) return Response.json({ error: "Code invalide, expiré ou coureur hors course." }, { status: 401 });
    if (payload.client === "native") {
      return Response.json(
        { device: connection.device, token: connection.token },
        { status: 201, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      { device: connection.device },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": trackingCookie(connection.token, connection.device.expiresAt),
        },
      },
    );
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Connexion GPS impossible." }, { status: 500 });
  }
}
