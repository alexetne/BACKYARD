import { POSITION_BATCH_SIZE } from "./constants";
import { getQueue, loadSession, removeQueuedPositions, updateSyncStatus } from "./storage";
import type { RouteStatus, TrackingAlert, TrackingDevice } from "./types";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function normalizeApiUrl(value: string) {
  const candidate = value.trim().replace(/\/+$/, "");
  const url = new URL(candidate);
  const isPrivateHost = url.hostname === "localhost"
    || url.hostname === "127.0.0.1"
    || url.hostname.startsWith("192.168.")
    || url.hostname.startsWith("10.")
    || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isPrivateHost)) {
    throw new Error("Utilise HTTPS, ou une adresse IP locale pendant le développement.");
  }
  return candidate;
}

export async function connectDevice(apiUrl: string, code: string) {
  const response = await request<{ device: TrackingDevice; token: string }>(apiUrl, "/api/tracking/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, client: "native" }),
  });
  if (!response.token || response.token.length < 32) throw new Error("Le serveur n’a pas délivré de jeton mobile.");
  return response;
}

export function getSession(apiUrl: string, token: string) {
  return request<{ connected: boolean; device: TrackingDevice }>(apiUrl, "/api/tracking/session", {}, token);
}

export function disconnectDevice(apiUrl: string, token: string) {
  return request<{ connected: false }>(apiUrl, "/api/tracking/session", { method: "DELETE" }, token);
}

export function getMyAlerts(apiUrl: string, token: string) {
  return request<{ alerts: TrackingAlert[] }>(apiUrl, "/api/tracking/alerts?mine=1", {}, token);
}

export function sendTrackingAlert(apiUrl: string, token: string, kind: "assistance" | "urgent", message: string) {
  return request<{ alert: TrackingAlert }>(apiUrl, "/api/tracking/alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, message }),
  }, token);
}

export async function flushPositionQueue() {
  const { apiUrl, token } = await loadSession();
  if (!apiUrl || !token) return { sent: 0, remaining: (await getQueue()).length };

  let sent = 0;
  while (true) {
    const queue = await getQueue();
    if (!queue.length) return { sent, remaining: 0 };
    const batch = queue.slice(0, POSITION_BATCH_SIZE);
    try {
      const payload = await request<{ accepted: number; receivedAt: number; route: RouteStatus | null }>(
        apiUrl,
        "/api/tracking/positions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ positions: batch }),
        },
        token,
      );
      const remaining = await removeQueuedPositions(batch);
      sent += batch.length;
      await updateSyncStatus({
        lastSyncAt: payload.receivedAt || Date.now(),
        route: payload.route,
        error: null,
        authInvalid: false,
      });
      if (!remaining) return { sent, remaining: 0 };
    } catch (error) {
      const authInvalid = error instanceof ApiError && error.status === 401;
      await updateSyncStatus({
        error: authInvalid
          ? "L’association de ce téléphone n’est plus valide."
          : "Pas de réseau : les positions restent stockées sur le téléphone.",
        authInvalid,
      });
      return { sent, remaining: queue.length };
    }
  }
}

async function request<T>(apiUrl: string, path: string, init: RequestInit = {}, token?: string) {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Serveur injoignable. Vérifie son adresse et le réseau.", 0);
  }
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new ApiError(payload.error || `Erreur serveur (${response.status}).`, response.status);
  return payload;
}
