import { getDb } from "../db";
import type { DashboardEvent, DashboardRunner, EventSummary, GpxPoint, RaceUpdate } from "./types";

type EventRow = {
  id: number;
  name: string;
  location: string;
  start_at: number;
  loop_distance_km: number;
  total_loops: number | null;
  status: "draft" | "live" | "finished";
  gpx_name: string;
  gpx_points: string;
  route_distance_km: number;
  elevation_gain_m: number;
  min_elevation_m: number | null;
  max_elevation_m: number | null;
};

type ParticipantRow = {
  id: number;
  bib: number;
  name: string;
  country: string;
  status: "active" | "out" | "dns";
  lap_count: number;
  last_lap_seconds: number | null;
  best_lap_seconds: number | null;
  last_finished_at: number | null;
  profile_slug: string | null;
  avatar_emoji: string | null;
};

type PositionRow = {
  participant_id: number;
  latitude: number;
  longitude: number;
  accuracy_m: number;
  speed_mps: number | null;
  heading_deg: number | null;
  recorded_at: number;
};

export function getDashboardEvent(eventId?: number): DashboardEvent | null {
  const db = getDb();
  const event = (eventId
    ? db.prepare("SELECT * FROM events WHERE id = ?").get(eventId)
    : db.prepare("SELECT * FROM events WHERE is_active = 1 ORDER BY id DESC LIMIT 1").get()) as EventRow | undefined;

  if (!event) return null;

  const participantRows = db.prepare(`
    SELECT
      p.id, p.bib, p.name, p.country, p.status,
      CASE WHEN rp.is_public = 1 AND rp.approved_at IS NOT NULL THEN rp.slug END AS profile_slug,
      CASE WHEN rp.is_public = 1 AND rp.approved_at IS NOT NULL THEN rp.avatar_emoji END AS avatar_emoji,
      COUNT(l.id) AS lap_count,
      (SELECT duration_seconds FROM laps last_lap WHERE last_lap.participant_id = p.id ORDER BY lap_number DESC LIMIT 1) AS last_lap_seconds,
      MIN(l.duration_seconds) AS best_lap_seconds,
      (SELECT finished_at FROM laps last_lap WHERE last_lap.participant_id = p.id ORDER BY lap_number DESC LIMIT 1) AS last_finished_at
    FROM participants p
    LEFT JOIN laps l ON l.participant_id = p.id
    LEFT JOIN runner_profiles rp ON rp.participant_id = p.id
    WHERE p.event_id = ?
    GROUP BY p.id
    ORDER BY lap_count DESC, last_finished_at ASC, p.bib ASC
  `).all(event.id) as unknown as ParticipantRow[];

  const positionRows = db.prepare(`
    SELECT gp.participant_id, gp.latitude, gp.longitude, gp.accuracy_m,
           gp.speed_mps, gp.heading_deg, gp.recorded_at
    FROM gps_positions gp
    JOIN (
      SELECT participant_id, MAX(recorded_at) AS latest_recorded_at
      FROM gps_positions
      WHERE event_id = ?
      GROUP BY participant_id
    ) latest ON latest.participant_id = gp.participant_id
            AND latest.latest_recorded_at = gp.recorded_at
    WHERE gp.event_id = ?
  `).all(event.id, event.id) as unknown as PositionRow[];
  const positionsByParticipant = new Map(positionRows.map((position) => [position.participant_id, position]));

  const now = Date.now();
  const elapsedMs = Math.max(0, now - event.start_at);
  const scheduledLap = now < event.start_at ? 0 : Math.floor(elapsedMs / 3_600_000) + 1;
  const completedLaps = participantRows.reduce((maximum, row) => Math.max(maximum, Number(row.lap_count)), 0);
  const currentLap = Math.max(scheduledLap, completedLaps, 1);
  const nextDepartureIndex = now < event.start_at ? 0 : Math.floor(elapsedMs / 3_600_000) + 1;

  const runners: DashboardRunner[] = participantRows.map((row, index) => {
    const laps = Number(row.lap_count);
    const position = positionsByParticipant.get(row.id);
    return {
      id: row.id,
      rank: index + 1,
      name: row.name,
      bib: row.bib,
      country: row.country,
      laps,
      distanceKm: laps * event.loop_distance_km,
      lastLapSeconds: row.last_lap_seconds === null ? null : Number(row.last_lap_seconds),
      bestLapSeconds: row.best_lap_seconds === null ? null : Number(row.best_lap_seconds),
      lastFinishedAt: row.last_finished_at === null ? null : Number(row.last_finished_at),
      state: row.status === "out" || row.status === "dns"
        ? "abandon"
        : laps >= currentLap
          ? "arrive"
          : "course",
      profileSlug: row.profile_slug,
      avatarEmoji: row.avatar_emoji,
      livePosition: position && position.recorded_at >= now - 5 * 60 * 1000 ? {
        latitude: Number(position.latitude),
        longitude: Number(position.longitude),
        accuracyM: Number(position.accuracy_m),
        speedMps: position.speed_mps === null ? null : Number(position.speed_mps),
        headingDeg: position.heading_deg === null ? null : Number(position.heading_deg),
        recordedAt: Number(position.recorded_at),
      } : null,
    };
  });

  const updates = db.prepare(`
    SELECT id, type, title, detail, created_at
    FROM race_updates
    WHERE event_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 12
  `).all(event.id) as unknown as Array<{ id: number; type: string; title: string; detail: string; created_at: number }>;

  return {
    id: event.id,
    name: event.name,
    location: event.location,
    startAt: event.start_at,
    loopDistanceKm: event.loop_distance_km,
    totalLoops: event.total_loops,
    status: event.status,
    gpxName: event.gpx_name,
    routePoints: JSON.parse(event.gpx_points) as GpxPoint[],
    routeDistanceKm: event.route_distance_km,
    elevationGainM: event.elevation_gain_m,
    minElevationM: event.min_elevation_m,
    maxElevationM: event.max_elevation_m,
    stats: {
      completedLaps,
      currentLap,
      activeRunners: participantRows.filter((row) => row.status === "active").length,
      totalRunners: participantRows.length,
      distanceKm: completedLaps * event.loop_distance_km,
      nextDepartureAt: event.start_at + nextDepartureIndex * 3_600_000,
    },
    runners,
    updates: updates.map((update): RaceUpdate => ({
      id: update.id,
      type: update.type,
      title: update.title,
      detail: update.detail,
      createdAt: update.created_at,
    })),
  };
}

export function listEvents(): EventSummary[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, name, location, start_at, status, is_active
    FROM events
    ORDER BY start_at DESC, id DESC
  `).all() as unknown as Array<{
    id: number; name: string; location: string; start_at: number; status: string; is_active: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    location: row.location,
    startAt: row.start_at,
    status: row.status,
    isActive: row.is_active === 1,
  }));
}
