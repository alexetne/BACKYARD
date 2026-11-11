import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb } from "../db";

export const TRACKING_COOKIE = "last_loop_tracking_device";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TRACKING_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export type TrackingDevice = {
  id: number;
  eventId: number;
  participantId: number;
  expiresAt: number;
  runnerName: string;
  bib: number;
  eventName: string;
  participantStatus: "active" | "out" | "dns";
};

export function generateTrackingCode(eventId: number, participantId: number, directorId: number) {
  const db = getDb();
  const row = db.prepare(`
    SELECT p.bib, p.name, e.start_at
    FROM participants p JOIN events e ON e.id = p.event_id
    WHERE p.id = ? AND e.id = ?
  `).get(participantId, eventId) as { bib: number; name: string; start_at: number } | undefined;
  if (!row) throw new Error("Coureur introuvable pour cet événement.");

  const suffix = Array.from({ length: 8 }, () => CODE_ALPHABET[randomBytes(1)[0] % CODE_ALPHABET.length]).join("");
  const code = `${row.bib}-${suffix}`;
  const salt = randomBytes(16).toString("hex");
  const hash = deriveCode(code, salt);
  const now = Date.now();
  const expiresAt = Math.max(row.start_at + TRACKING_DURATION_MS, now + 48 * 60 * 60 * 1000);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`
      INSERT INTO tracking_codes (
        event_id, participant_id, code_hash, code_salt, code_hint,
        expires_at, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(event_id, participant_id) DO UPDATE SET
        code_hash = excluded.code_hash,
        code_salt = excluded.code_salt,
        code_hint = excluded.code_hint,
        expires_at = excluded.expires_at,
        created_by = excluded.created_by,
        updated_at = excluded.updated_at
    `).run(eventId, participantId, hash, salt, suffix.slice(-2), expiresAt, directorId, now, now);
    db.prepare(`
      UPDATE tracking_devices SET revoked_at = ?
      WHERE event_id = ? AND participant_id = ? AND revoked_at IS NULL
    `).run(now, eventId, participantId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { code, expiresAt, runnerName: row.name, bib: row.bib };
}

export function connectTrackingDevice(rawCode: string) {
  const code = normalizeCode(rawCode);
  const match = /^(\d{1,6})-([A-Z2-9]{8})$/.exec(code);
  if (!match) return null;
  const bib = Number(match[1]);
  const now = Date.now();
  const row = getDb().prepare(`
    SELECT tc.code_hash, tc.code_salt, tc.expires_at,
           p.id AS participant_id, p.name AS runner_name, p.status AS participant_status,
           e.id AS event_id, e.name AS event_name
    FROM tracking_codes tc
    JOIN participants p ON p.id = tc.participant_id
    JOIN events e ON e.id = tc.event_id
    WHERE e.is_active = 1 AND p.bib = ? AND tc.expires_at > ?
    LIMIT 1
  `).get(bib, now) as {
    code_hash: string; code_salt: string; expires_at: number;
    participant_id: number; runner_name: string; participant_status: "active" | "out" | "dns";
    event_id: number; event_name: string;
  } | undefined;
  if (!row || !verifyCode(code, row.code_salt, row.code_hash) || row.participant_status !== "active") return null;

  const db = getDb();
  const token = randomBytes(32).toString("base64url");
  db.exec("BEGIN IMMEDIATE");
  let deviceId: number;
  try {
    db.prepare(`
      UPDATE tracking_devices SET revoked_at = ?
      WHERE event_id = ? AND participant_id = ? AND revoked_at IS NULL
    `).run(now, row.event_id, row.participant_id);
    const result = db.prepare(`
      INSERT INTO tracking_devices (
        event_id, participant_id, token_hash, expires_at, last_seen_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(row.event_id, row.participant_id, hashToken(token), row.expires_at, now, now);
    deviceId = Number(result.lastInsertRowid);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return {
    token,
    device: {
      id: deviceId,
      eventId: row.event_id,
      participantId: row.participant_id,
      expiresAt: row.expires_at,
      runnerName: row.runner_name,
      bib,
      eventName: row.event_name,
      participantStatus: row.participant_status,
    } satisfies TrackingDevice,
  };
}

export function getTrackingDevice(request: Request): TrackingDevice | null {
  const token = readCookie(request.headers.get("cookie"), TRACKING_COOKIE);
  if (!token) return null;
  const row = getDb().prepare(`
    SELECT td.id, td.event_id, td.participant_id, td.expires_at,
           p.name AS runner_name, p.bib, p.status AS participant_status,
           e.name AS event_name
    FROM tracking_devices td
    JOIN participants p ON p.id = td.participant_id
    JOIN events e ON e.id = td.event_id
    WHERE td.token_hash = ? AND td.revoked_at IS NULL AND td.expires_at > ?
  `).get(hashToken(token), Date.now()) as {
    id: number; event_id: number; participant_id: number; expires_at: number;
    runner_name: string; bib: number; participant_status: "active" | "out" | "dns"; event_name: string;
  } | undefined;
  return row ? {
    id: row.id,
    eventId: row.event_id,
    participantId: row.participant_id,
    expiresAt: row.expires_at,
    runnerName: row.runner_name,
    bib: row.bib,
    eventName: row.event_name,
    participantStatus: row.participant_status,
  } : null;
}

export function trackingCookie(token: string, expiresAt: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${TRACKING_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Expires=${new Date(expiresAt).toUTCString()}${secure}`;
}

export function expiredTrackingCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${TRACKING_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export function revokeTrackingDevice(deviceId: number) {
  getDb().prepare("UPDATE tracking_devices SET revoked_at = ? WHERE id = ?").run(Date.now(), deviceId);
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "").replace(/^#/, "");
}

function deriveCode(code: string, salt: string) {
  return scryptSync(code, salt, 32).toString("hex");
}

function verifyCode(code: string, salt: string, expectedHash: string) {
  const actual = Buffer.from(deriveCode(code, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function readCookie(header: string | null, name: string) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}
