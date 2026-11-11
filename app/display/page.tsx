"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DashboardEvent } from "../../lib/types";

const RUNNERS_PER_PAGE = 7;

export default function CampDisplayPage() {
  const [event, setEvent] = useState<DashboardEvent | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/events/active", { cache: "no-store" });
      const payload = await response.json() as { event?: DashboardEvent; error?: string };
      if (!response.ok || !payload.event) throw new Error(payload.error || "Aucune course active.");
      setEvent(payload.event); setError("");
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Données indisponibles."); }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const data = window.setInterval(() => void refresh(), 5_000);
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    const pages = window.setInterval(() => setPage((current) => current + 1), 10_000);
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      window.clearTimeout(initial); window.clearInterval(data); window.clearInterval(clock); window.clearInterval(pages);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, [refresh]);

  const pageCount = Math.max(1, Math.ceil((event?.runners.length ?? 0) / RUNNERS_PER_PAGE));
  const visibleRunners = useMemo(() => {
    if (!event) return [];
    const safePage = page % pageCount;
    return event.runners.slice(safePage * RUNNERS_PER_PAGE, (safePage + 1) * RUNNERS_PER_PAGE);
  }, [event, page, pageCount]);

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }

  if (!event) return <main className="camp-display camp-display-empty"><div className="display-brand">⌁ LAST LOOP</div><h1>{error || "Connexion au direct…"}</h1><p>L’écran se mettra à jour automatiquement dès qu’une course sera active.</p></main>;

  const secondsLeft = Math.max(0, Math.ceil((event.stats.nextDepartureAt - now) / 1000));
  const elapsedSeconds = Math.max(0, Math.floor((now - event.startAt) / 1000));
  const nextLap = event.stats.nextDepartureAt === event.startAt ? 1 : event.stats.currentLap + 1;
  const liveGpsCount = event.runners.filter((runner) => runner.livePosition && runner.livePosition.recordedAt >= now - 2 * 60 * 1000).length;

  return (
    <main className={`camp-display ${secondsLeft <= 5 * 60 ? "departure-close" : ""}`}>
      <header className="display-header">
        <div className="display-brand"><span>⌁</span> LAST LOOP</div>
        <div className="display-event"><span className="display-live-dot" /> EN DIRECT <b>{event.name}</b><small>{event.location}</small></div>
        <div className="display-clock"><strong>{formatClock(now)}</strong><button type="button" onClick={() => void toggleFullscreen()}>{fullscreen ? "QUITTER PLEIN ÉCRAN" : "PLEIN ÉCRAN"}</button></div>
      </header>

      <section className="display-hero">
        <article className="display-countdown">
          <div><span>PROCHAIN DÉPART · BOUCLE {nextLap}</span><b>{formatTime(event.stats.nextDepartureAt)}</b></div>
          <strong>{formatCountdown(secondsLeft)}</strong>
          <div className="display-progress"><i style={{ width: `${Math.max(0, Math.min(100, 100 - (secondsLeft / 3600) * 100))}%` }} /></div>
        </article>
        <article className="display-standing">
          <span>ENCORE EN LICE</span>
          <strong>{event.stats.activeRunners}</strong>
          <p>sur {event.stats.totalRunners} au départ</p>
        </article>
      </section>

      <section className="display-kpis">
        <div><span>BOUCLE ACTUELLE</span><b>{event.stats.currentLap}<small> / {event.totalLoops ?? "∞"}</small></b></div>
        <div><span>DISTANCE DE TÊTE</span><b>{formatNumber(event.stats.distanceKm)}<small> km</small></b></div>
        <div><span>TEMPS DE COURSE</span><b>{formatElapsed(elapsedSeconds)}</b></div>
        <div><span>GPS EN DIRECT</span><b>{liveGpsCount}<small> / {event.stats.activeRunners}</small></b></div>
      </section>

      <section className="display-bottom">
        <article className="display-ranking">
          <div className="display-section-heading"><span>CLASSEMENT LIVE</span><small>PAGE {(page % pageCount) + 1} / {pageCount}</small></div>
          <div className="display-runner-head"><span>POS</span><span>COUREUR</span><span>TOURS</span><span>DERNIER TOUR</span><span>STATUT</span></div>
          {visibleRunners.map((runner) => <div className={`display-runner ${runner.state === "abandon" ? "is-out" : ""}`} key={runner.id}>
            <span>{runner.rank.toString().padStart(2, "0")}</span>
            <span className="display-runner-name"><i>{runner.avatarEmoji || initials(runner.name)}</i><b>{runner.name}<small>#{runner.bib} · {runner.country}</small></b></span>
            <strong>{runner.laps}</strong>
            <span className="display-mono">{runner.lastLapSeconds === null ? "—" : formatLap(runner.lastLapSeconds)}</span>
            <em className={`display-status status-${runner.state}`}>{runner.state === "course" ? "EN COURSE" : runner.state === "arrive" ? "AU CAMP" : "ARRÊT"}</em>
          </div>)}
        </article>

        <aside className="display-feed">
          <div className="display-section-heading"><span>FIL DU CAMP</span><small>AUTO · 5 S</small></div>
          {event.updates.slice(0, 5).map((update, index) => <div className="display-feed-item" key={update.id}><i className={update.type} /><time>{formatTime(update.createdAt)}</time><div><b>{update.title}</b><p>{update.detail}</p></div>{index === 0 && <span>NEW</span>}</div>)}
        </aside>
      </section>
    </main>
  );
}

function formatCountdown(total: number) { const minutes = Math.floor(total / 60).toString().padStart(2, "0"); const seconds = (total % 60).toString().padStart(2, "0"); return `${minutes}:${seconds}`; }
function formatElapsed(total: number) { const hours = Math.floor(total / 3600).toString().padStart(2, "0"); const minutes = Math.floor((total % 3600) / 60).toString().padStart(2, "0"); return `${hours}:${minutes}`; }
function formatLap(total: number) { return `${Math.floor(total / 60).toString().padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`; }
function formatNumber(value: number) { return value.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
function formatClock(value: number) { return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value); }
function formatTime(value: number) { return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(value); }
function initials(name: string) { return name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
