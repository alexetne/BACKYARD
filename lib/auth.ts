import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../db";
import type { AccountStatus, AuthUser, UserRole } from "./types";

export const SESSION_COOKIE = "last_loop_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_DURATION_MS = 60 * 60 * 1000;
const INVITE_DURATION_MS = 48 * 60 * 60 * 1000;

type UserRow = {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  password_salt: string;
  role: UserRole;
  participant_id: number | null;
  account_status: AccountStatus;
};

export class AuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function hasUsers() {
  const row = getDb().prepare("SELECT EXISTS(SELECT 1 FROM users) AS present").get() as { present: number };
  return row.present === 1;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validatePassword(password: string) {
  if (password.length < 12) throw new AuthError("Le mot de passe doit contenir au moins 12 caractères.", 400);
  if (password.length > 200) throw new AuthError("Le mot de passe est trop long.", 400);
}

export function makePassword(password: string) {
  validatePassword(password);
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: derivePassword(password, salt) };
}

export function verifyPassword(password: string, salt: string, expectedHash: string) {
  const actual = Buffer.from(derivePassword(password, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createSession(userId: number) {
  const db = getDb();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(hashToken(token), userId, expiresAt, Date.now());
  return { token, expiresAt };
}

export function createPasswordToken(userId: number, purpose: "invite" | "reset") {
  const db = getDb();
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const expiresAt = now + (purpose === "invite" ? INVITE_DURATION_MS : RESET_DURATION_MS);
  db.prepare("DELETE FROM password_reset_tokens WHERE expires_at <= ? OR used_at IS NOT NULL").run(now);
  db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL").run(userId);
  db.prepare(`
    INSERT INTO password_reset_tokens (user_id, token_hash, purpose, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, hashToken(token), purpose, expiresAt, now);
  return { token, expiresAt };
}

export function getPasswordToken(token: string) {
  if (!token || token.length > 200) return null;
  return getDb().prepare(`
    SELECT t.id, t.user_id, t.purpose, t.expires_at, u.email, u.name, u.role
    FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > ?
  `).get(hashToken(token), Date.now()) as {
    id: number; user_id: number; purpose: "invite" | "reset"; expires_at: number;
    email: string; name: string; role: UserRole;
  } | undefined ?? null;
}

export function consumePasswordToken(token: string, password: string) {
  const entry = getPasswordToken(token);
  if (!entry) throw new AuthError("Ce lien est invalide ou a expiré.", 400);
  const credentials = makePassword(password);
  const db = getDb();
  const now = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`
      UPDATE users
      SET password_hash = ?, password_salt = ?, account_status = 'active', updated_at = ?
      WHERE id = ?
    `).run(credentials.hash, credentials.salt, now, entry.user_id);
    db.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE id = ?").run(now, entry.id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(entry.user_id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return entry;
}

export function deleteSession(token: string | null) {
  if (!token) return;
  getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

export function sessionCookie(token: string, expiresAt: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Expires=${new Date(expiresAt).toUTCString()}${secure}`;
}

export function expiredSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export function getRequestUser(request: Request) {
  return userFromToken(readCookie(request.headers.get("cookie"), SESSION_COOKIE));
}

export async function getCurrentUser() {
  const store = await cookies();
  return userFromToken(store.get(SESSION_COOKIE)?.value ?? null);
}

export function requireRequestRole(request: Request, roles: UserRole[]) {
  const user = getRequestUser(request);
  if (!user) throw new AuthError("Authentification requise.", 401);
  if (!roles.includes(user.role)) throw new AuthError("Accès refusé pour ce rôle.", 403);
  return user;
}

export async function requirePageRole(roles: UserRole[], returnTo: string) {
  if (!hasUsers()) redirect("/setup");
  const user = await getCurrentUser();
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  if (!roles.includes(user.role)) redirect(homeForRole(user.role));
  return user;
}

export function homeForRole(role: UserRole) {
  if (role === "director") return "/director";
  if (role === "admin") return "/admin";
  return "/runner";
}

export function publicUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    participantId: row.participant_id,
    accountStatus: row.account_status,
  };
}

export function getUserByEmail(email: string) {
  return getDb().prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(normalizeEmail(email)) as UserRow | undefined;
}

function userFromToken(token: string | null) {
  if (!token) return null;
  const row = getDb().prepare(`
    SELECT u.*
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(hashToken(token), Date.now()) as UserRow | undefined;
  return row ? publicUser(row) : null;
}

function derivePassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
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
