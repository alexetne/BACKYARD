"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GpxRouteCanvas } from "./components/GpxRouteCanvas";
import type { DashboardEvent } from "../lib/types";

const filters = ["Tous", "En course", "Arrivés"];
const publicNavigation = [
  { href: "#classement", label: "Classement" },
  { href: "#parcours", label: "Parcours" },
  { href: "/track", label: "Partager GPS" },
  { href: "/display", label: "Écran camp" },
  { href: "/admin", label: "Pilotage" },
];

export default function Home() {
  const [event, setEvent] = useState<DashboardEvent | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("Tous");
  const [followed, setFollowed] = useState<number[]>([]);
  const [shareLabel, setShareLabel] = useState("Partager");
  const [now, setNow] = useState(() => Date.now());

  const loadEvent = useCallback(async () => {
    try {
      const response = await fetch("/api/events/active", { cache: "no-store" });
      const payload = await response.json() as { event?: DashboardEvent; error?: string };
      if (!response.ok || !payload.event) throw new Error(payload.error || "Aucun événement actif.");
      setEvent(payload.event);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Données indisponibles.");
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadEvent(), 0);
    const dataInterval = window.setInterval(() => void loadEvent(), 10_000);
    const clockInterval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(dataInterval);
      window.clearInterval(clockInterval);
    };
  }, [loadEvent]);

  const visibleRunners = useMemo(() => {
    if (!event) return [];
    if (filter === "En course") return event.runners.filter((runner) => runner.state === "course");
    if (filter === "Arrivés") return event.runners.filter((runner) => runner.state === "arrive");
    return event.runners;
  }, [event, filter]);

  if (!event) {
    return (
      <main className="loading-page">
        <div className="brand"><span className="brand-mark">⌁</span><span>LAST LOOP</span></div>
        <div><span className="live-dot" /><b>{error || "Chargement de la course…"}</b></div>
        {error && <a href="/admin">Créer ou activer un événement →</a>}
      </main>
    );
  }

  const secondsLeft = Math.max(0, Math.ceil((event.stats.nextDepartureAt - now) / 1000));
  const elapsedSeconds = Math.max(0, Math.floor((now - event.startAt) / 1000));
  const nextLap = event.stats.nextDepartureAt === event.startAt ? 1 : event.stats.currentLap + 1;
  const dateLabel = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(event.startAt).toUpperCase();

  function toggleFollow(id: number) {
    setFollowed((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function sharePage() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(window.location.href);
      } else {
        const field = document.createElement("textarea");
        field.value = window.location.href;
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        document.execCommand("copy");
        field.remove();
      }
      setShareLabel("Lien copié !");
    } catch {
      setShareLabel("Copie impossible");
    }
    window.setTimeout(() => setShareLabel("Partager"), 2_000);
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Last Loop, accueil">
          <span className="brand-mark" aria-hidden="true">⌁</span><span>LAST LOOP</span>
        </a>
        <a className="event-switcher" href="#course-overview" aria-label={`Voir le résumé de ${event.name}`}>
          <span className="event-date">{dateLabel}</span><span className="event-name">{event.name}</span><span className="chevron">⌄</span>
        </a>
        <nav className="nav-actions" aria-label="Navigation principale">
          {publicNavigation.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
          <details className="mobile-nav">
            <summary>Menu</summary>
            <div>{publicNavigation.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}</div>
          </details>
          <button className="share-button" type="button" onClick={() => void sharePage()} aria-live="polite">{shareLabel} <span>↗</span></button>
        </nav>
      </header>

      <div className="page-shell" id="top">
        <section className="event-heading" id="course-overview">
          <div>
            <div className="eyebrow"><span className="live-dot" /> LIVE · {event.status.toUpperCase()}</div>
            <h1>{event.name}</h1>
          </div>
          <div className="event-meta">
            <p>{event.location}</p>
            <p>Départ {formatDateTime(event.startAt)}</p>
            <div className="weather">⌁ {formatNumber(event.loopDistanceKm, 3)} km <span className="muted">· {event.gpxName}</span></div>
          </div>
        </section>

        <section className="live-grid" aria-label="Résumé de la course">
          <article className="countdown-card">
            <div className="card-kicker">PROCHAIN DÉPART</div>
            <div className="countdown">{formatCountdown(secondsLeft)}</div>
            <div className="countdown-footer"><span>Tour {nextLap}</span><span>{formatTime(event.stats.nextDepartureAt)}</span></div>
            <div className="progress-track" aria-hidden="true"><span style={{ width: `${Math.min(100, (secondsLeft / 3600) * 100)}%` }} /></div>
          </article>

          <article className="stat-card lime-card">
            <div className="card-kicker">BOUCLES EFFECTUÉES</div>
            <strong>{event.stats.completedLaps}<small> / {event.totalLoops ?? "∞"}</small></strong>
            <div className="stat-bottom"><span>Boucle actuelle : {event.stats.currentLap}</span><a href="#classement">Voir le classement <span aria-hidden="true">↗</span></a></div>
          </article>

          <article className="stat-card dark-card">
            <div className="card-kicker">ENCORE EN LICE</div>
            <strong>{event.stats.activeRunners}</strong>
            <div className="stat-bottom"><span>sur {event.stats.totalRunners} au départ</span><span className="trend">LIVE</span></div>
          </article>

          <article className="stat-card distance-card">
            <div className="card-kicker">DISTANCE PARCOURUE</div>
            <strong>{formatNumber(event.stats.distanceKm, 1)}<small> km</small></strong>
            <div className="stat-bottom"><span>Temps de course</span><span className="elapsed-time">{formatElapsed(elapsedSeconds)}</span></div>
          </article>
        </section>

        <section className="content-grid">
          <article className="leaderboard" id="classement">
            <div className="section-title-row">
              <div><div className="eyebrow">CLASSEMENT EN DIRECT</div><h2>Les derniers debout.</h2></div>
              <div className="filters" role="group" aria-label="Filtrer le classement">
                {filters.map((item) => <button key={item} className={filter === item ? "active" : ""} type="button" onClick={() => setFilter(item)}>{item}</button>)}
              </div>
            </div>

            <div className="runner-table" role="table" aria-label="Classement des participants">
              <div className="runner-row table-head" role="row"><span>POS.</span><span>ATHLÈTE</span><span>TOURS</span><span>DISTANCE</span><span>DERNIER TOUR</span><span>STATUT</span><span /></div>
              {visibleRunners.length === 0 && <div className="table-empty">Aucun coureur dans cette vue.</div>}
              {visibleRunners.map((runner) => (
                <div className={`runner-row ${runner.state === "abandon" ? "is-out" : ""}`} role="row" key={runner.id}>
                  <span className="rank">{runner.rank.toString().padStart(2, "0")}</span>
                  <span className="athlete">
                    <span className="avatar">{runner.avatarEmoji || initials(runner.name)}</span>
                    <span>
                      {runner.profileSlug ? <a className="runner-profile-link" href={`/runners/${runner.profileSlug}`}>{runner.name} <i aria-hidden="true">↗</i></a> : <b>{runner.name}</b>}
                      <small>#{runner.bib} · {runner.country}</small>
                    </span>
                  </span>
                  <span><b>{runner.laps}</b></span>
                  <span>{formatNumber(runner.distanceKm, 1)} <small>km</small></span>
                  <span className="mono">{runner.lastLapSeconds === null ? "—" : formatLap(runner.lastLapSeconds)}</span>
                  <span><span className={`status status-${runner.state}`}><i />{runner.state === "course" ? "EN COURSE" : runner.state === "arrive" ? "ARRIVÉ" : "ABANDON"}</span></span>
                  <button className={`follow ${followed.includes(runner.id) ? "is-followed" : ""}`} type="button" onClick={() => toggleFollow(runner.id)} aria-label={`${followed.includes(runner.id) ? "Ne plus suivre" : "Suivre"} ${runner.name}`} aria-pressed={followed.includes(runner.id)}>{followed.includes(runner.id) ? "★" : "☆"}</button>
                </div>
              ))}
            </div>
            <a className="view-all" href="/admin">Gérer les participants <span>→</span></a>
          </article>

          <aside className="live-feed" aria-label="Fil de course en direct">
            <div className="feed-heading"><div><span className="live-dot" /> FIL DE COURSE</div><span>AUTO</span></div>
            <div className="feed-list">
              {event.updates.slice(0, 6).map((update, index) => (
                <div className="feed-item" key={update.id}>
                  <div className={`feed-marker ${update.type === "out" ? "orange" : update.type === "lap" ? "lime" : "dark"}`}><span /></div>
                  <time>{formatTime(update.createdAt)}</time><div><b>{update.title}</b><p>{update.detail}</p></div>
                  {index === 0 && <span className="new-label">NEW</span>}
                </div>
              ))}
            </div>
            <a className="feed-button" href="/admin">Piloter la course <span>↗</span></a>
          </aside>
        </section>

        <section className="course-card" id="parcours">
          <div className="course-copy">
            <div className="eyebrow">LA BOUCLE · GPX</div>
            <h2>{formatNumber(event.loopDistanceKm, 3)} km.<br />Encore. Et encore.</h2>
            <p>Le tracé affiché est celui importé lors de la création de l’événement. Il contient {event.routePoints.length} points simplifiés pour le suivi public.</p>
            <div className="course-stats">
              <span><b>+{Math.round(event.elevationGainM)} m</b><small>DÉNIVELÉ GPX</small></span>
              <span><b>{event.minElevationM === null ? "—" : `${Math.round(event.minElevationM)} m`}</b><small>ALT. MIN.</small></span>
              <span><b>{event.maxElevationM === null ? "—" : `${Math.round(event.maxElevationM)} m`}</b><small>ALT. MAX.</small></span>
            </div>
          </div>
          <div className="route-map-wrap">
            <GpxRouteCanvas points={event.routePoints} label={event.gpxName} runners={event.runners} />
            <div className="route-map-meta"><span>{event.gpxName}</span><span>{formatNumber(event.routeDistanceKm, 2)} km mesurés</span></div>
          </div>
        </section>

        <footer>
          <a className="brand footer-brand" href="#top" aria-label="Revenir en haut de la page"><span className="brand-mark">⌁</span><span>LAST LOOP</span></a>
          <p>Le suivi live des courses qui ne s’arrêtent jamais.</p>
          <span>Données SQLite · Mise à jour {formatTime(now)}</span>
        </footer>
      </div>
    </main>
  );
}

function formatCountdown(total: number) {
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60).toString().padStart(2, "0");
  const seconds = (total % 60).toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

function formatElapsed(total: number) {
  const hours = Math.floor(total / 3600).toString().padStart(2, "0");
  const minutes = Math.floor((total % 3600) / 60).toString().padStart(2, "0");
  const seconds = (total % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function formatLap(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function formatNumber(value: number, digits: number) {
  return value.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatTime(value: number) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value);
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(value);
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}
