"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SessionMenu } from "../components/SessionMenu";
import type { AuthUser, RunnerProfileFields } from "../../lib/types";

type RunnerProfile = {
  id: number;
  name: string;
  bib: number;
  country: string;
  status: "active" | "out" | "dns";
  event_id: number;
  event_name: string;
  location: string;
  start_at: number;
  loop_distance_km: number;
  total_loops: number | null;
  gpx_name: string;
};

type RunnerLap = { lap_number: number; started_at: number; finished_at: number; duration_seconds: number };
type EditableRunnerProfile = RunnerProfileFields & { slug: string; approved: boolean };

export default function RunnerPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [runner, setRunner] = useState<RunnerProfile | null>(null);
  const [laps, setLaps] = useState<RunnerLap[]>([]);
  const [profile, setProfile] = useState<EditableRunnerProfile | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/runner/me", { cache: "no-store" });
    if (response.status === 401) return window.location.assign("/login?returnTo=/runner");
    const payload = await response.json() as { user?: AuthUser; runner?: RunnerProfile | null; laps?: RunnerLap[]; profile?: EditableRunnerProfile; error?: string };
    if (!response.ok) return setError(payload.error || "Données indisponibles.");
    setUser(payload.user ?? null); setRunner(payload.runner ?? null); setLaps(payload.laps ?? []); setProfile(payload.profile ?? null); setError("");
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSavingProfile(true); setProfileMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/runner/profile", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avatarEmoji: form.get("avatarEmoji"), city: form.get("city"), club: form.get("club"),
          ageCategory: form.get("ageCategory"), bio: form.get("bio"), backyardGoal: form.get("backyardGoal"),
          favoriteSnack: form.get("favoriteSnack"), mantra: form.get("mantra"), funFact: form.get("funFact"),
          isPublic: form.get("isPublic") === "on",
        }),
      });
      const payload = await response.json() as { profile?: EditableRunnerProfile; error?: string };
      if (!response.ok || !payload.profile) throw new Error(payload.error || "Enregistrement impossible.");
      setProfile(payload.profile); setProfileMessage("Profil enregistré. La page publique est à jour.");
    } catch (saveError) { setProfileMessage(saveError instanceof Error ? saveError.message : "Enregistrement impossible."); }
    finally { setSavingProfile(false); }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refresh(), 0);
    const dataInterval = window.setInterval(() => void refresh(), 15_000);
    const clockInterval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => { window.clearTimeout(initialLoad); window.clearInterval(dataInterval); window.clearInterval(clockInterval); };
  }, [refresh]);

  const stats = useMemo(() => {
    const durations = laps.map((lap) => lap.duration_seconds);
    return {
      best: durations.length ? Math.min(...durations) : null,
      average: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
    };
  }, [laps]);

  if (!runner) {
    return <main className="runner-space"><header className="admin-header"><Link className="brand" href="/"><span className="brand-mark">⌁</span><span>LAST LOOP</span></Link><SessionMenu /></header><section className="runner-empty"><div className="eyebrow">ESPACE COUREUR</div><h1>{error || `Bonjour ${user?.name ?? ""}`}</h1><p>Ton compte n’est pas encore lié à un participant. La direction de course peut effectuer cette association.</p></section></main>;
  }

  const elapsedMs = Math.max(0, now - runner.start_at);
  const nextDepartureAt = now < runner.start_at ? runner.start_at : runner.start_at + (Math.floor(elapsedMs / 3_600_000) + 1) * 3_600_000;
  const secondsLeft = Math.max(0, Math.ceil((nextDepartureAt - now) / 1000));
  const completedDistance = laps.length * runner.loop_distance_km;

  return (
    <main className="runner-space">
      <header className="admin-header"><Link className="brand" href="/"><span className="brand-mark">⌁</span><span>LAST LOOP</span></Link><SessionMenu /></header>
      <section className="runner-hero">
        <div><div className="eyebrow">ESPACE COUREUR · #{runner.bib}</div><h1>{runner.name}</h1><p>{runner.event_name} · {runner.location}</p></div>
        <span className={`runner-state runner-state-${runner.status}`}>{runner.status === "active" ? "EN COURSE" : runner.status === "out" ? "ARRÊTÉ" : "NON PARTANT"}</span>
      </section>
      <section className="runner-metrics">
        <article className="runner-countdown"><div className="card-kicker">PROCHAIN DÉPART</div><strong>{formatCountdown(secondsLeft)}</strong><span>{formatTime(nextDepartureAt)}</span></article>
        <article><div className="card-kicker">BOUCLES</div><strong>{laps.length}<small> / {runner.total_loops ?? "∞"}</small></strong><span>{formatNumber(completedDistance)} km</span></article>
        <article><div className="card-kicker">MEILLEUR TOUR</div><strong>{stats.best === null ? "—" : formatLap(stats.best)}</strong><span>Moy. {stats.average === null ? "—" : formatLap(stats.average)}</span></article>
      </section>
      {profile && <section className="runner-profile-editor">
        <div className="profile-editor-heading">
          <div><div className="eyebrow">MON PORTRAIT PUBLIC</div><h2>Donne du relief<br />au dossard.</h2></div>
          <div><p>Ces informations donnent aux visiteurs autre chose qu’un chrono à suivre. Tu gardes la main sur la visibilité.</p>{profile.approved && profile.isPublic && <Link href={`/runners/${profile.slug}`}>Voir mon profil public ↗</Link>}</div>
        </div>
        {profileMessage && <div className="profile-save-message" role="status">{profileMessage}</div>}
        <form className="profile-editor-form" onSubmit={saveProfile}>
          <label className="emoji-field">Mon signe distinctif<select name="avatarEmoji" defaultValue={profile.avatarEmoji}>{["🏃", "🦊", "🐺", "🦉", "🐐", "⚡", "🌙", "🔥", "🥨", "🫎"].map((emoji) => <option key={emoji}>{emoji}</option>)}</select></label>
          <label>Ville<input name="city" maxLength={80} defaultValue={profile.city} placeholder="Annecy" /></label>
          <label>Club / équipe<input name="club" maxLength={100} defaultValue={profile.club} placeholder="Les Lacets Libres" /></label>
          <label>Catégorie<input name="ageCategory" maxLength={40} defaultValue={profile.ageCategory} placeholder="Senior F, Master 0 H…" /></label>
          <label className="profile-wide">En quelques mots<textarea name="bio" maxLength={500} defaultValue={profile.bio} placeholder="Ce qui t’amène sur une Backyard…" /></label>
          <label>Objectif Backyard<input name="backyardGoal" maxLength={160} defaultValue={profile.backyardGoal} placeholder="Voir deux levers de soleil" /></label>
          <label>Carburant préféré<input name="favoriteSnack" maxLength={100} defaultValue={profile.favoriteSnack} placeholder="Purée, brioche, bouillon…" /></label>
          <label>Mantra<input name="mantra" maxLength={160} defaultValue={profile.mantra} placeholder="Une boucle à la fois." /></label>
          <label>Le petit truc fun<input name="funFact" maxLength={220} defaultValue={profile.funFact} placeholder="Une anecdote qui te ressemble" /></label>
          <label className="profile-public-toggle"><input name="isPublic" type="checkbox" defaultChecked={profile.isPublic} /> Afficher ma fiche aux visiteurs</label>
          <button className="primary-action" type="submit" disabled={savingProfile}>{savingProfile ? "Enregistrement…" : "Mettre à jour mon profil"}<span>→</span></button>
        </form>
      </section>}
      <section className="runner-history">
        <div className="section-title-row"><div><div className="eyebrow">MON HISTORIQUE</div><h2>Tour après tour.</h2></div><span>{runner.gpx_name}</span></div>
        <div className="lap-history-head"><span>TOUR</span><span>HEURE D’ARRIVÉE</span><span>TEMPS</span><span>ÉCART</span></div>
        {laps.length === 0 && <p className="empty-state">Aucun tour enregistré pour le moment.</p>}
        {laps.map((lap, index) => {
          const previous = laps[index + 1];
          const delta = previous ? lap.duration_seconds - previous.duration_seconds : null;
          return <div className="lap-history-row" key={lap.lap_number}><b>{lap.lap_number.toString().padStart(2, "0")}</b><span>{formatTime(lap.finished_at)}</span><strong>{formatLap(lap.duration_seconds)}</strong><span className={delta !== null && delta > 0 ? "delta-slow" : "delta-fast"}>{delta === null ? "—" : `${delta > 0 ? "+" : "−"}${formatDelta(Math.abs(delta))}`}</span></div>;
        })}
      </section>
    </main>
  );
}

function formatCountdown(total: number) { const minutes = Math.floor(total / 60).toString().padStart(2, "0"); const seconds = (total % 60).toString().padStart(2, "0"); return `${minutes}:${seconds}`; }
function formatLap(total: number) { return `${Math.floor(total / 60).toString().padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`; }
function formatDelta(total: number) { return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`; }
function formatTime(value: number) { return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value); }
function formatNumber(value: number) { return value.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
