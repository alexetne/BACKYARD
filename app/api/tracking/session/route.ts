import {
  expiredTrackingCookie,
  getTrackingDevice,
  revokeTrackingDevice,
} from "../../../../lib/tracking";

export async function GET(request: Request) {
  const device = getTrackingDevice(request);
  if (!device) return Response.json({ connected: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return Response.json({ connected: true, device }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  const device = getTrackingDevice(request);
  if (device) revokeTrackingDevice(device.id);
  return Response.json({ connected: false }, { headers: { "Set-Cookie": expiredTrackingCookie() } });
}
