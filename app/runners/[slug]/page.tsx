import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicRunnerProfile } from "../../../lib/runner-profile";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const runner = getPublicRunnerProfile(slug);
  if (!runner) return { title: "Coureur introuvable — Last Loop", robots: { index: false, follow: false } };
  const description = runner.bio || `${runner.name}, dossard #${runner.bib} sur ${runner.eventName}. Découvre ses tours et ses statistiques en direct.`;
  return {
    title: `${runner.name} — ${runner.eventName} | Last Loop`,
    description,
    openGraph: { title: `${runner.name} — Last Loop`, description, images: [] },
    twitter: { card: "summary", title: `${runner.name} — Last Loop`, description, images: [] },
  };
}

export default async function PublicRunnerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const runner = getPublicRunnerProfile(slug);
  if (!runner) notFound();

  const durations = runner.laps.map((lap) => lap.durationSeconds);
  const fastest = durations.length ? Math.min(...durations) : null;
  const average = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null;
  const averageValue = average ?? 0;
  const deviation = average === null ? null : Math.sqrt(durations.reduce((sum, value) => sum + (value - averageValue) ** 2, 0) / durations.length);
  const consistency = deviation === null || averageValue === 0 ? null : Math.max(0, Math.round(100 - (deviation / averageValue) * 100));
  const totalDistance = runner.laps.length * runner.loopDistanceKm;
  const quickLaps = durations.filter((duration) => duration < 55 * 60).length;
  const elapsed = runner.laps.length
    ? Math.max(...runner.laps.map((lap) => lap.finishedAt)) - Math.min(...runner.laps.map((lap) => lap.startedAt))
    : 0;

  return (
    <main className="public-runner-page">
      <header className="profile-topbar">
        <Link className="brand" href="/"><span className="brand-mark">⌁</span><span>LAST LOOP</span></Link>
        <Link href="/#classement">← Retour au classement</Link>
      </header>

      <section className="public-profile-hero">
        <div className="public-profile-avatar" aria-hidden="true">{runner.avatarEmoji}</div>
        <div className="public-profile-title">
          <div className="eyebrow">PORTRAIT COUREUR · #{runner.bib} · {runner.country}</div>
          <h1>{runner.name}</h1>
          <p>{[runner.city, runner.club, runner.ageCategory].filter(Boolean).join(" · ") || runner.eventLocation}</p>
        </div>
        <span className={`runner-state runner-state-${runner.status}`}>
          {runner.status === "active" ? "EN COURSE" : runner.status === "out" ? "ARRÊTÉ" : "NON PARTANT"}
        </span>
      </section>

      <section className="public-profile-stats" aria-label="Statistiques du coureur">
        <article><span>BOUCLES</span><strong>{runner.laps.length}<small> / {runner.totalLoops ?? "∞"}</small></strong><p>{formatNumber(totalDistance)} km avalés</p></article>
        <article><span>TOUR FUSÉE</span><strong>{fastest === null ? "—" : formatLap(fastest)}</strong><p>Moyenne {average === null ? "—" : formatLap(average)}</p></article>
        <article><span>RÉGULARITÉ</span><strong>{consistency === null ? "—" : `${consistency}%`}</strong><p>{quickLaps} tour{quickLaps > 1 ? "s" : ""} sous 55 min</p></article>
        <article><span>TEMPS DEHORS</span><strong>{elapsed ? formatDuration(elapsed) : "—"}</strong><p>Depuis le premier départ</p></article>
      </section>

      <section className="public-profile-body">
        <article className="profile-story">
          <div className="eyebrow">DERRIÈRE LE DOSSARD</div>
          <h2>{runner.mantra || "Une boucle à la fois."}</h2>
          <p className="profile-bio">{runner.bio || "Ce coureur garde encore un peu de mystère pour les prochaines boucles."}</p>
          <div className="profile-fun-grid">
            <FunCard label="OBJECTIF BACKYARD" value={runner.backyardGoal} fallback="Aller chercher la prochaine cloche" />
            <FunCard label="CARBURANT PRÉFÉRÉ" value={runner.favoriteSnack} fallback="Le secret du ravito" />
            <FunCard label="LE TRUC EN PLUS" value={runner.funFact} fallback="À découvrir sur la ligne de départ" />
            <FunCard label="ÉQUIVALENT CAFÉS" value={`${Math.max(1, Math.round(totalDistance / 12))}`} fallback="1" suffix=" cafés imaginaires" />
          </div>
        </article>

        <aside className="profile-race-card">
          <div className="eyebrow">COURSE EN COURS</div>
          <h3>{runner.eventName}</h3>
          <p>{runner.eventLocation}</p>
          <dl><div><dt>DÉPART</dt><dd>{formatDate(runner.eventStartAt)}</dd></div><div><dt>BOUCLE</dt><dd>{formatNumber(runner.loopDistanceKm)} km</dd></div></dl>
          <Link href="/">Voir le live complet <span>→</span></Link>
        </aside>
      </section>

      <section className="public-lap-history">
        <div className="section-title-row"><div><div className="eyebrow">CHRONO OUVERT</div><h2>Ses tours, sans filtre.</h2></div><span>{runner.laps.length} passage{runner.laps.length > 1 ? "s" : ""}</span></div>
        <div className="lap-history-head"><span>TOUR</span><span>ARRIVÉE</span><span>CHRONO</span><span>VS. MOYENNE</span></div>
        {runner.laps.length === 0 && <p className="empty-state">Le premier chrono apparaîtra ici.</p>}
        {runner.laps.map((lap) => {
          const delta = average === null ? null : lap.durationSeconds - average;
          return <div className="lap-history-row" key={lap.lapNumber}><b>{lap.lapNumber.toString().padStart(2, "0")}</b><span>{formatTime(lap.finishedAt)}</span><strong>{formatLap(lap.durationSeconds)}</strong><span className={delta !== null && delta > 0 ? "delta-slow" : "delta-fast"}>{delta === null ? "—" : `${delta > 0 ? "+" : "−"}${formatDelta(Math.abs(delta))}`}</span></div>;
        })}
      </section>

      <footer className="profile-footer"><span>Profil validé par la direction de course</span><Link href="/">LAST LOOP · LIVE TRACKING</Link></footer>
    </main>
  );
}

function FunCard({ label, value, fallback, suffix = "" }: { label: string; value: string; fallback: string; suffix?: string }) {
  return <div><span>{label}</span><b>{value || fallback}{value || !suffix ? suffix : ""}</b></div>;
}

function formatLap(seconds: number) { return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`; }
function formatDelta(seconds: number) { return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`; }
function formatNumber(value: number) { return value.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
function formatTime(value: number) { return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value); }
function formatDate(value: number) { return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(value); }
function formatDuration(milliseconds: number) { const hours = Math.floor(milliseconds / 3_600_000); return `${hours}h${Math.floor((milliseconds % 3_600_000) / 60_000).toString().padStart(2, "0")}`; }
