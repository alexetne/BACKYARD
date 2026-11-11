export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    start_at INTEGER NOT NULL,
    loop_distance_km REAL NOT NULL CHECK (loop_distance_km > 0),
    total_loops INTEGER CHECK (total_loops IS NULL OR total_loops > 0),
    gpx_name TEXT NOT NULL,
    gpx_xml TEXT NOT NULL,
    gpx_points TEXT NOT NULL,
    route_distance_km REAL NOT NULL,
    elevation_gain_m REAL NOT NULL DEFAULT 0,
    min_elevation_m REAL,
    max_elevation_m REAL,
    is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
    status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('draft', 'live', 'finished')),
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    bib INTEGER NOT NULL,
    name TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'FR',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'out', 'dns')),
    created_at INTEGER NOT NULL,
    UNIQUE(event_id, bib)
  )`,
  `CREATE TABLE IF NOT EXISTS laps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    lap_number INTEGER NOT NULL CHECK (lap_number > 0),
    started_at INTEGER NOT NULL,
    finished_at INTEGER NOT NULL,
    duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
    created_at INTEGER NOT NULL,
    UNIQUE(participant_id, lap_number)
  )`,
  `CREATE TABLE IF NOT EXISTS race_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('runner', 'admin', 'director')),
    participant_id INTEGER UNIQUE REFERENCES participants(id) ON DELETE SET NULL,
    account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('pending', 'invited', 'active', 'disabled')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(email)
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS runner_profiles (
    participant_id INTEGER PRIMARY KEY REFERENCES participants(id) ON DELETE CASCADE,
    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    slug TEXT NOT NULL UNIQUE,
    avatar_emoji TEXT NOT NULL DEFAULT '🏃',
    city TEXT NOT NULL DEFAULT '',
    club TEXT NOT NULL DEFAULT '',
    age_category TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    backyard_goal TEXT NOT NULL DEFAULT '',
    favorite_snack TEXT NOT NULL DEFAULT '',
    mantra TEXT NOT NULL DEFAULT '',
    fun_fact TEXT NOT NULL DEFAULT '',
    is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0, 1)),
    approved_at INTEGER,
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    purpose TEXT NOT NULL CHECK (purpose IN ('invite', 'reset')),
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tracking_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    code_salt TEXT NOT NULL,
    code_hint TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(event_id, participant_id)
  )`,
  `CREATE TABLE IF NOT EXISTS tracking_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    last_seen_at INTEGER,
    revoked_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS gps_positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    device_id INTEGER NOT NULL REFERENCES tracking_devices(id) ON DELETE CASCADE,
    latitude REAL NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
    longitude REAL NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
    accuracy_m REAL NOT NULL CHECK (accuracy_m >= 0),
    altitude_m REAL,
    speed_mps REAL,
    heading_deg REAL,
    recorded_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    UNIQUE(device_id, recorded_at)
  )`,
  `CREATE TABLE IF NOT EXISTS tracking_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    device_id INTEGER NOT NULL REFERENCES tracking_devices(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('assistance', 'urgent')),
    message TEXT NOT NULL DEFAULT '',
    latitude REAL,
    longitude REAL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
    created_at INTEGER NOT NULL,
    acknowledged_at INTEGER,
    acknowledged_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    resolved_at INTEGER,
    resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_events_one_active
    ON events(is_active) WHERE is_active = 1`,
  `CREATE INDEX IF NOT EXISTS idx_participants_event_status
    ON participants(event_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_laps_event_participant
    ON laps(event_id, participant_id, lap_number)`,
  `CREATE INDEX IF NOT EXISTS idx_updates_event_created
    ON race_updates(event_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_token_expiry
    ON sessions(token_hash, expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_users_role
    ON users(role)`,
  `CREATE INDEX IF NOT EXISTS idx_profiles_public_slug
    ON runner_profiles(is_public, slug)`,
  `CREATE INDEX IF NOT EXISTS idx_reset_tokens_hash_expiry
    ON password_reset_tokens(token_hash, expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_tracking_codes_event_participant
    ON tracking_codes(event_id, participant_id, expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_tracking_devices_event_participant
    ON tracking_devices(event_id, participant_id, revoked_at)`,
  `CREATE INDEX IF NOT EXISTS idx_gps_positions_event_received
    ON gps_positions(event_id, received_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_gps_positions_participant_recorded
    ON gps_positions(participant_id, recorded_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_tracking_alerts_event_status_created
    ON tracking_alerts(event_id, status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_tracking_alerts_participant_created
    ON tracking_alerts(participant_id, created_at DESC)`,
] as const;
