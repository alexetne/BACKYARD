import { getDb } from "../db";
import type { RunnerProfileFields, RunnerPublicProfile } from "./types";

type ProfileRow = {
  slug: string;
  avatar_emoji: string;
  city: string;
  club: string;
  age_category: string;
  bio: string;
  backyard_goal: string;
  favorite_snack: string;
  mantra: string;
  fun_fact: string;
  is_public: number;
};

export function ensureRunnerProfile(participantId: number, userId: number | null = null) {
  const db = getDb();
  const existing = db.prepare("SELECT slug FROM runner_profiles WHERE participant_id = ?").get(participantId) as { slug: string } | undefined;
  if (existing) {
    if (userId) db.prepare("UPDATE runner_profiles SET user_id = ?, updated_at = ? WHERE participant_id = ?").run(userId, Date.now(), participantId);
    return existing.slug;
  }
  const participant = db.prepare("SELECT name, bib FROM participants WHERE id = ?").get(participantId) as { name: string; bib: number } | undefined;
  if (!participant) throw new Error("Participant introuvable.");
  const base = slugify(`${participant.name}-${participant.bib}`) || `coureur-${participantId}`;
  let slug = base;
  let suffix = 2;
  while (db.prepare("SELECT 1 FROM runner_profiles WHERE slug = ?").get(slug)) slug = `${base}-${suffix++}`;
  db.prepare(`
    INSERT INTO runner_profiles (participant_id, user_id, slug, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(participantId, userId, slug, Date.now());
  return slug;
}

export function getEditableRunnerProfile(participantId: number) {
  ensureRunnerProfile(participantId);
  const row = getDb().prepare("SELECT * FROM runner_profiles WHERE participant_id = ?").get(participantId) as ProfileRow & {
    approved_at: number | null;
  };
  return { ...mapFields(row), slug: row.slug, approved: row.approved_at !== null };
}

export function updateRunnerProfile(participantId: number, fields: RunnerProfileFields) {
  ensureRunnerProfile(participantId);
  getDb().prepare(`
    UPDATE runner_profiles SET
      avatar_emoji = ?, city = ?, club = ?, age_category = ?, bio = ?,
      backyard_goal = ?, favorite_snack = ?, mantra = ?, fun_fact = ?,
      is_public = ?, updated_at = ?
    WHERE participant_id = ?
  `).run(
    fields.avatarEmoji, fields.city, fields.club, fields.ageCategory, fields.bio,
    fields.backyardGoal, fields.favoriteSnack, fields.mantra, fields.funFact,
    fields.isPublic ? 1 : 0, Date.now(), participantId,
  );
}

export function getPublicRunnerProfile(slug: string): RunnerPublicProfile | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT rp.*, p.name, p.bib, p.country, p.status,
           e.name AS event_name, e.location AS event_location,
           e.start_at AS event_start_at, e.loop_distance_km, e.total_loops
    FROM runner_profiles rp
    JOIN participants p ON p.id = rp.participant_id
    JOIN events e ON e.id = p.event_id
    WHERE rp.slug = ? AND rp.is_public = 1 AND rp.approved_at IS NOT NULL
  `).get(slug) as (ProfileRow & {
    participant_id: number;
    name: string;
    bib: number;
    country: string;
    status: "active" | "out" | "dns";
    event_name: string;
    event_location: string;
    event_start_at: number;
    loop_distance_km: number;
    total_loops: number | null;
  }) | undefined;
  if (!row) return null;
  const lapRows = db.prepare(`
    SELECT lap_number, started_at, finished_at, duration_seconds
    FROM laps WHERE participant_id = ? ORDER BY lap_number DESC
  `).all(row.participant_id) as unknown as Array<{
    lap_number: number; started_at: number; finished_at: number; duration_seconds: number;
  }>;
  return {
    ...mapFields(row),
    slug: row.slug,
    name: row.name,
    bib: row.bib,
    country: row.country,
    status: row.status,
    eventName: row.event_name,
    eventLocation: row.event_location,
    eventStartAt: row.event_start_at,
    loopDistanceKm: row.loop_distance_km,
    totalLoops: row.total_loops,
    laps: lapRows.map((lap) => ({
      lapNumber: lap.lap_number,
      startedAt: lap.started_at,
      finishedAt: lap.finished_at,
      durationSeconds: lap.duration_seconds,
    })),
  };
}

export function normalizeProfileInput(payload: Partial<RunnerProfileFields>): RunnerProfileFields {
  return {
    avatarEmoji: clean(payload.avatarEmoji, 8) || "🏃",
    city: clean(payload.city, 80),
    club: clean(payload.club, 100),
    ageCategory: clean(payload.ageCategory, 40),
    bio: clean(payload.bio, 500),
    backyardGoal: clean(payload.backyardGoal, 160),
    favoriteSnack: clean(payload.favoriteSnack, 100),
    mantra: clean(payload.mantra, 160),
    funFact: clean(payload.funFact, 220),
    isPublic: payload.isPublic !== false,
  };
}

function mapFields(row: ProfileRow): RunnerProfileFields {
  return {
    avatarEmoji: row.avatar_emoji,
    city: row.city,
    club: row.club,
    ageCategory: row.age_category,
    bio: row.bio,
    backyardGoal: row.backyard_goal,
    favoriteSnack: row.favorite_snack,
    mantra: row.mantra,
    funFact: row.fun_fact,
    isPublic: row.is_public === 1,
  };
}

function clean(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maximum) : "";
}

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
