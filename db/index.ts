import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { schemaStatements } from "./schema";

let database: DatabaseSync | null = null;

export function getDb() {
  if (database) return database;

  const databasePath = process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.join(process.cwd(), "data", "backyard.sqlite");

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA busy_timeout = 5000");

  for (const statement of schemaStatements) database.exec(statement);
  ensureColumn(database, "users", "account_status", "TEXT NOT NULL DEFAULT 'active'");
  database.exec("PRAGMA optimize");
  if (shouldSeedDemoData()) {
    seedDemoEvent(database);
    seedDemoProfiles(database);
  }

  return database;
}

function shouldSeedDemoData() {
  const configured = process.env.SEED_DEMO_DATA?.trim().toLowerCase();
  if (configured) return ["1", "true", "yes", "on"].includes(configured);
  return process.env.NODE_ENV !== "production";
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function seedDemoEvent(db: DatabaseSync) {
  const existing = db.prepare("SELECT id FROM events LIMIT 1").get();
  if (existing) return;

  const now = Date.now();
  const startAt = now - (17 * 60 * 60 + 28 * 60 + 18) * 1000;
  const routePoints = [
    [48.4039, 2.6981, 84], [48.4051, 2.7018, 87], [48.4078, 2.7042, 93],
    [48.4112, 2.7064, 108], [48.4141, 2.7048, 129], [48.4153, 2.7011, 142],
    [48.4138, 2.6964, 131], [48.4107, 2.6932, 115], [48.4072, 2.6916, 101],
    [48.4043, 2.6938, 91], [48.4039, 2.6981, 84],
  ].map(([lat, lon, ele]) => ({ lat, lon, ele }));

  db.exec("BEGIN IMMEDIATE");
  try {
    const event = db.prepare(`
      INSERT INTO events (
        name, location, start_at, loop_distance_km, total_loops, gpx_name,
        gpx_xml, gpx_points, route_distance_km, elevation_gain_m,
        min_elevation_m, max_elevation_m, is_active, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'live', ?)
    `).run(
      "Backyard de la Forêt", "Forêt de Fontainebleau, FR", startAt, 6.706,
      null, "boucle-demo.gpx", "<!-- Parcours de démonstration -->",
      JSON.stringify(routePoints), 6.706, 92, 84, 142, now,
    );
    const eventId = Number(event.lastInsertRowid);

    const people = [
      { name: "Amélie Roux", bib: 27, country: "FR", laps: 18, duration: 3138, status: "active" },
      { name: "Jonas Berg", bib: 14, country: "SE", laps: 18, duration: 3222, status: "active" },
      { name: "Léon Marchal", bib: 42, country: "FR", laps: 17, duration: 3374, status: "active" },
      { name: "Sofia Benali", bib: 8, country: "BE", laps: 17, duration: 3412, status: "active" },
      { name: "Milo Andersen", bib: 31, country: "DK", laps: 17, duration: 3461, status: "active" },
      { name: "Nina Keller", bib: 19, country: "CH", laps: 17, duration: 3561, status: "out" },
    ];
    const insertParticipant = db.prepare(
      "INSERT INTO participants (event_id, bib, name, country, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const insertLap = db.prepare(`
      INSERT INTO laps (event_id, participant_id, lap_number, started_at, finished_at, duration_seconds, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const person of people) {
      const participant = insertParticipant.run(eventId, person.bib, person.name, person.country, person.status, now);
      const participantId = Number(participant.lastInsertRowid);
      for (let lap = 1; lap <= person.laps; lap += 1) {
        const duration = lap === person.laps ? person.duration : 3100 + ((lap * 37 + person.bib) % 380);
        const lapStartedAt = startAt + (lap - 1) * 60 * 60 * 1000;
        insertLap.run(eventId, participantId, lap, lapStartedAt, lapStartedAt + duration * 1000, duration, now);
      }
    }

    const insertUpdate = db.prepare(
      "INSERT INTO race_updates (event_id, type, title, detail, created_at) VALUES (?, ?, ?, ?, ?)",
    );
    insertUpdate.run(eventId, "lap", "Jonas Berg boucle le tour", "Tour 18 · 53:42", now - 21 * 60 * 1000);
    insertUpdate.run(eventId, "lap", "Amélie Roux est de retour", "Tour 18 · 52:18", now - 22 * 60 * 1000);
    insertUpdate.run(eventId, "out", "Nina Keller abandonne", "Après 17 tours · 114,0 km", now - 26 * 60 * 1000);
    insertUpdate.run(eventId, "start", "Départ du tour 18", "23 participants au départ", now - 73 * 60 * 1000);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function seedDemoProfiles(db: DatabaseSync) {
  const event = db.prepare("SELECT id FROM events WHERE name = ? LIMIT 1").get("Backyard de la Forêt") as { id: number } | undefined;
  if (!event) return;

  const profiles = [
    ["Amélie Roux", "amelie-roux", "🦊", "Annecy", "Les Lacets Libres", "Senior F", "Je cours pour voir jusqu'où la nuit peut m'emmener.", "Passer le cap des 24 heures", "Purée de patate douce", "Doucement, longtemps, sûrement.", "Je reconnais une chanson en moins de deux secondes."],
    ["Jonas Berg", "jonas-berg", "🫎", "Göteborg", "North Miles", "Senior H", "Ultra, café noir et longues conversations au ravito.", "Battre mon record de 31 boucles", "Brioche à la cannelle", "Une boucle à la fois.", "Je collectionne les chaussettes de course improbables."],
    ["Léon Marchal", "leon-marchal", "🐺", "Lyon", "Canuts Endurance", "Master 0 H", "J'aime les formats simples qui deviennent très compliqués.", "Voir le lever du soleil deux fois", "Riz au lait", "Rester curieux quand ça pique.", "Mon premier ultra était un pari perdu."],
    ["Sofia Benali", "sofia-benali", "⚡", "Bruxelles", "Brussels Trail Lab", "Senior F", "Du bitume au trail, tant qu'il reste une boucle à partager.", "Atteindre les 100 miles", "Gaufre salée", "Sourire au prochain départ.", "Je donne un prénom à chaque frontale."],
    ["Milo Andersen", "milo-andersen", "🦉", "Aarhus", "Midnight Runners DK", "Senior H", "Je préfère courir la nuit et compter les étoiles plutôt que les kilomètres.", "Tenir jusqu'au petit déjeuner", "Réglisse et banane", "Calme dehors, solide dedans.", "Je sais jongler avec trois gourdes."],
    ["Nina Keller", "nina-keller", "🐐", "Lausanne", "Alpine Social Club", "Master 0 F", "Montagnarde curieuse venue tester la répétition parfaite.", "Revenir plus forte sur la prochaine", "Bouillon et chocolat noir", "Le plaisir décide du tempo.", "Je fais toujours un dessin sur mon dossard."],
  ] as const;
  const insert = db.prepare(`
    INSERT OR IGNORE INTO runner_profiles (
      participant_id, slug, avatar_emoji, city, club, age_category, bio,
      backyard_goal, favorite_snack, mantra, fun_fact, is_public,
      approved_at, updated_at
    )
    SELECT id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?
    FROM participants WHERE event_id = ? AND name = ?
  `);
  const now = Date.now();
  for (const [name, slug, emoji, city, club, category, bio, goal, snack, mantra, funFact] of profiles) {
    insert.run(slug, emoji, city, club, category, bio, goal, snack, mantra, funFact, now, now, event.id, name);
  }
}
