"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SessionMenu } from "../../components/SessionMenu";
import type { DashboardEvent, DashboardRunner } from "../../../lib/types";

type TrackingRunner = {
  id: number;
  bib: number;
  name: string;
  status: "active" | "out" | "dns";
  code_hint: string | null;
  code_expires_at: number | null;
  last_seen_at: number | null;
  last_position_at: number | null;
  distance_from_route_m: number | null;
  off_route: boolean;
};

type GeneratedCode = { participantId: number; runnerName: string; code: string; expiresAt: number };

type TrackingAlert = {
  id: number;
  kind: "assistance" | "urgent";
  message: string;
  latitude: number | null;
  longitude: number | null;
  status: "open" | "acknowledged" | "resolved";
  created_at: number;
  acknowledged_at: number | null;
  resolved_at: number | null;
  participant_id: number;
  runner_name: string;
  bib: number;
  acknowledged_by_name: string | null;
  resolved_by_name: string | null;
};

export default function DirectorDashboardPage() {
  const [event, setEvent] = useState<DashboardEvent | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [lapTimes, setLapTimes] = useState<Record<number, string>>({});
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [trackingRunners, setTrackingRunners] = useState<TrackingRunner[]>([]);
  const [trackingBusyId, setTrackingBusyId] = useState<number | null>(null);
  const [generatedCode, setGeneratedCode] = useState<GeneratedCode | null>(null);
  const [trackingAlerts, setTrackingAlerts] = useState<TrackingAlert[]>([]);
  const [alertBusyId, setAlertBusyId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/events/active", { cache: "no-store" });
    const payload = await response.json() as { event?: DashboardEvent };
    const activeEvent = payload.event ?? null;
    setEvent(activeEvent);
    if (!activeEvent) { setTrackingRunners([]); setTrackingAlerts([]); return; }
    const [trackingResponse, alertsResponse] = await Promise.all([
      fetch(`/api/tracking/codes?eventId=${activeEvent.id}`, { cache: "no-store" }),
      fetch(`/api/tracking/alerts?eventId=${activeEvent.id}`, { cache: "no-store" }),
    ]);
    if (trackingResponse.status === 401) { window.location.assign("/login?returnTo=/ds"); return; }
    if (trackingResponse.ok) {
      const trackingPayload = await trackingResponse.json() as { runners?: TrackingRunner[] };
      setTrackingRunners(trackingPayload.runners ?? []);
    }
    if (alertsResponse.ok) {
      const alertsPayload = await alertsResponse.json() as { alerts?: TrackingAlert[] };
      setTrackingAlerts(alertsPayload.alerts ?? []);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const data = window.setInterval(() => void refresh(), 5_000);
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => { window.clearTimeout(initial); window.clearInterval(data); window.clearInterval(clock); };
  }, [refresh]);

  const operations = useMemo(() => {
    if (!event) return { onCourse: [], atCamp: [], recent: [], slow: [] };
    const active = event.runners.filter((runner) => runner.state !== "abandon");
    const beforeStart = now < event.startAt;
    return {
      onCourse: beforeStart ? [] : active.filter((runner) => runner.state === "course"),
      atCamp: beforeStart ? active : active.filter((runner) => runner.state === "arrive"),
      recent: [...active].filter((runner) => runner.lastFinishedAt !== null).sort((a, b) => (b.lastFinishedAt ?? 0) - (a.lastFinishedAt ?? 0)).slice(0, 6),
      slow: active.filter((runner) => (runner.lastLapSeconds ?? 0) >= 55 * 60),
    };
  }, [event, now]);

  async function recordLap(runner: DashboardRunner) {
    setBusyId(runner.id); setMessage("");
    try {
      await api("/api/laps", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: runner.id, durationSeconds: parseLapTime(lapTimes[runner.id]) }),
      });
      setLapTimes((current) => ({ ...current, [runner.id]: "" })); setMessage(`Tour de ${runner.name} enregistré.`); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Tour non enregistré."); }
    finally { setBusyId(null); }
  }

  async function markOut(runner: DashboardRunner) {
    if (!window.confirm(`Confirmer l’abandon de ${runner.name} ?`)) return;
    setBusyId(runner.id); setMessage("");
    try {
      await api(`/api/participants/${runner.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "out" }),
      });
      setMessage(`Abandon de ${runner.name} enregistré.`); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Mise à jour impossible."); }
    finally { setBusyId(null); }
  }

  async function generateGpsCode(runner: TrackingRunner) {
    if (runner.code_hint && !window.confirm(`Régénérer le code de ${runner.name} ? Son téléphone actuellement associé sera déconnecté.`)) return;
    setTrackingBusyId(runner.id); setMessage(""); setGeneratedCode(null);
    try {
      const response = await fetch("/api/tracking/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: event?.id, participantId: runner.id }),
      });
      const payload = await response.json() as { code?: string; expiresAt?: number; runnerName?: string; error?: string };
      if (response.status === 401) { window.location.assign("/login?returnTo=/ds"); return; }
      if (!response.ok || !payload.code || !payload.expiresAt) throw new Error(payload.error || "Génération impossible.");
      setGeneratedCode({ participantId: runner.id, runnerName: payload.runnerName || runner.name, code: payload.code, expiresAt: payload.expiresAt });
      setMessage(`Nouveau code GPS créé pour ${runner.name}. Il ne sera affiché en clair que maintenant.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Génération impossible.");
    } finally {
      setTrackingBusyId(null);
    }
  }

  async function updateAlert(alert: TrackingAlert, action: "acknowledge" | "resolve") {
    setAlertBusyId(alert.id); setMessage("");
    try {
      await api(`/api/tracking/alerts/${alert.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      setMessage(action === "acknowledge" ? `Alerte de ${alert.runner_name} prise en charge.` : `Alerte de ${alert.runner_name} clôturée.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Alerte non mise à jour.");
    } finally {
      setAlertBusyId(null);
    }
  }

  if (!event) return <main className="director-live"><header className="admin-header"><Link className="brand" href="/"><span className="brand-mark">⌁</span><span>LAST LOOP</span></Link><SessionMenu /></header><section className="runner-empty"><div className="eyebrow">DASHBOARD DIRECTEUR</div><h1>Aucune course active.</h1><p>Crée ou active un événement depuis l’espace direction.</p><Link className="primary-action director-empty-link" href="/director">Configurer l’événement <span>→</span></Link></section></main>;

  const secondsLeft = Math.max(0, Math.ceil((event.stats.nextDepartureAt - now) / 1000));
  const nextLap = event.stats.nextDepartureAt === event.startAt ? 1 : event.stats.currentLap + 1;
  const urgent = secondsLeft <= 10 * 60 && operations.onCourse.length > 0;
  const ordered = [...operations.onCourse, ...operations.atCamp];
  const activeAlerts = trackingAlerts.filter((alert) => alert.status !== "resolved");

  return (
    <main className="director-live">
      <header className="admin-header"><Link className="brand" href="/"><span className="brand-mark">⌁</span><span>LAST LOOP</span></Link><SessionMenu /></header>
      <section className="ds-topline">
        <div><div className="eyebrow"><span className="live-dot" /> POSTE DE COMMANDE · LIVE</div><h1>{event.name}</h1><p>{event.location} · actualisé à {formatClock(now)}</p></div>
        <div className="ds-top-actions"><Link href="/display" target="_blank" rel="noreferrer">Ouvrir l’écran camp ↗</Link><Link href="/admin">Chronométrage →</Link><Link href="/director">Configuration →</Link></div>
      </section>

      {message && <div className="admin-message ds-message" role="status">{message}</div>}

      {activeAlerts.length > 0 && <section className="ds-assistance-panel" aria-live="polite">
        <div className="ds-assistance-title"><span>!</span><div><div className="eyebrow">ASSISTANCE COURSE</div><h2>{activeAlerts.length} alerte{activeAlerts.length > 1 ? "s" : ""} à traiter.</h2></div></div>
        <div className="ds-assistance-list">{activeAlerts.map((alert) => <div className={`ds-assistance-row ${alert.kind} ${alert.status}`} key={alert.id}>
          <span><b>#{alert.bib} · {alert.runner_name}</b><small>{alert.kind === "urgent" ? "URGENCE" : "BESOIN D’AIDE"} · {formatRelative(alert.created_at, now)}</small></span>
          <span><b>{alert.message || "Aucune précision fournie."}</b>{alert.latitude !== null && alert.longitude !== null ? <a href={`https://www.openstreetmap.org/?mlat=${alert.latitude}&mlon=${alert.longitude}#map=17/${alert.latitude}/${alert.longitude}`} target="_blank" rel="noreferrer">Voir la dernière position ↗</a> : <small>Position non disponible</small>}</span>
          <span><em>{alert.status === "open" ? "À PRENDRE EN CHARGE" : "PRISE EN CHARGE"}</em><small>{alert.acknowledged_by_name ? `par ${alert.acknowledged_by_name}` : ""}</small></span>
          <span>{alert.status === "open" && <button disabled={alertBusyId !== null} type="button" onClick={() => void updateAlert(alert, "acknowledge")}>ACQUITTER</button>}<button disabled={alertBusyId !== null} className="resolve" type="button" onClick={() => void updateAlert(alert, "resolve")}>CLÔTURER</button></span>
        </div>)}</div>
      </section>}

      <section className={`ds-command-grid ${urgent ? "is-urgent" : ""}`}>
        <article className="ds-countdown">
          <div><span>PROCHAIN DÉPART</span><b>Boucle {nextLap} · {formatTime(event.stats.nextDepartureAt)}</b></div>
          <strong>{formatCountdown(secondsLeft)}</strong>
          <p>{urgent ? `${operations.onCourse.length} coureur${operations.onCourse.length > 1 ? "s" : ""} encore sur la boucle` : "Fenêtre de départ sous contrôle"}</p>
        </article>
        <article className="ds-command-stat lime"><span>AU CAMP</span><strong>{operations.atCamp.length}</strong><p>prêts pour le prochain départ</p></article>
        <article className="ds-command-stat orange"><span>SUR LA BOUCLE</span><strong>{operations.onCourse.length}</strong><p>retours encore attendus</p></article>
        <article className="ds-command-stat dark"><span>EN LICE</span><strong>{event.stats.activeRunners}</strong><p>sur {event.stats.totalRunners} engagés</p></article>
      </section>

      <section className="ds-workspace">
        <article className="ds-operations">
          <div className="ds-panel-heading"><div><div className="eyebrow">SUIVI DES RETOURS</div><h2>Qui manque à l’appel ?</h2></div><span>{ordered.length} coureurs actifs</span></div>
          <div className="ds-runner-head"><span>COUREUR</span><span>SITUATION</span><span>DERNIER TOUR</span><span>SAISIE</span><span>ACTIONS</span></div>
          {ordered.map((runner) => <div className={`ds-runner-row ${runner.state === "course" ? "needs-return" : "at-camp"}`} key={runner.id}>
            <span className="ds-runner-person"><i>{runner.avatarEmoji || initials(runner.name)}</i><span><b>{runner.name}</b><small>#{runner.bib} · {runner.laps} tour{runner.laps > 1 ? "s" : ""}</small></span></span>
            <span><em className={`ds-runner-state ${runner.state}`}>{runner.state === "course" ? "SUR LA BOUCLE" : "AU CAMP"}</em></span>
            <span className="ds-lap-time">{runner.lastLapSeconds === null ? "—" : formatLap(runner.lastLapSeconds)}<small>{runner.lastFinishedAt ? formatTime(runner.lastFinishedAt) : ""}</small></span>
            <input disabled={runner.state === "arrive"} value={lapTimes[runner.id] ?? ""} onChange={(change) => setLapTimes((current) => ({ ...current, [runner.id]: change.target.value }))} placeholder={runner.state === "arrive" ? "Validé" : "MM:SS"} aria-label={`Temps du tour de ${runner.name}`} />
            <span className="ds-runner-actions"><button disabled={busyId !== null || runner.state === "arrive"} onClick={() => void recordLap(runner)} type="button">Valider</button><button className="danger" disabled={busyId !== null} onClick={() => void markOut(runner)} type="button">Abandon</button></span>
          </div>)}
        </article>

        <aside className="ds-sidebar">
          <section className={`ds-alert-panel ${urgent ? "urgent" : ""}`}>
            <div className="eyebrow">VIGILANCE</div>
            {urgent ? <><h3>{operations.onCourse.length} retour{operations.onCourse.length > 1 ? "s" : ""} attendu{operations.onCourse.length > 1 ? "s" : ""}.</h3><p>Moins de 10 minutes avant le prochain départ.</p></> : <><h3>Situation nominale.</h3><p>Aucune alerte critique à cet instant.</p></>}
            {operations.slow.length > 0 && <div className="ds-slow-list"><span>DERNIER TOUR ≥ 55 MIN</span>{operations.slow.map((runner) => <b key={runner.id}>{runner.name} · {formatLap(runner.lastLapSeconds ?? 0)}</b>)}</div>}
          </section>
          <section className="ds-recent-panel"><div className="eyebrow">DERNIERS RETOURS</div>{operations.recent.map((runner) => <div key={runner.id}><time>{runner.lastFinishedAt ? formatTime(runner.lastFinishedAt) : "—"}</time><span><b>{runner.name}</b><small>Tour {runner.laps} · {runner.lastLapSeconds ? formatLap(runner.lastLapSeconds) : "—"}</small></span></div>)}</section>
          <section className="ds-feed-panel"><div className="eyebrow">FIL DE COURSE</div>{event.updates.slice(0, 4).map((update) => <div key={update.id}><i className={update.type} /><span><b>{update.title}</b><small>{update.detail}</small></span></div>)}</section>
        </aside>
      </section>

      <section className="ds-gps-panel">
        <div className="ds-gps-heading">
          <div><div className="eyebrow"><span className="live-dot" /> SUIVI GPS</div><h2>Codes coureurs & balises.</h2><p>Génère un code personnel, puis utilise l’application <b>Last Loop Tracker</b> ou ouvre <b>/track</b> sans installation.</p><div className="ds-export-actions"><a href={`/api/events/${event.id}/export?type=results`}>RÉSULTATS CSV</a><a href={`/api/events/${event.id}/export?type=laps`}>TOURS CSV</a><a href={`/api/events/${event.id}/export?type=gps`}>GPS CSV</a><a href={`/api/events/${event.id}/export?type=alerts`}>ALERTES CSV</a></div></div>
          <div><strong>{trackingRunners.filter((runner) => runner.last_position_at && runner.last_position_at >= now - 2 * 60 * 1000).length}</strong><span>GPS EN DIRECT</span><Link href="/track" target="_blank" rel="noreferrer">Ouvrir la page coureur ↗</Link></div>
        </div>

        {generatedCode && <div className="ds-generated-code" role="status">
          <div><span>CODE UNIQUE · {generatedCode.runnerName}</span><strong>{generatedCode.code}</strong><small>Valide jusqu’au {formatDateTime(generatedCode.expiresAt)}. Note-le maintenant : seul le suffixe sera ensuite visible.</small></div>
          <button type="button" onClick={() => void navigator.clipboard?.writeText(generatedCode.code)}>COPIER LE CODE</button>
        </div>}

        <div className="ds-gps-head"><span>COUREUR</span><span>CODE</span><span>APPAREIL</span><span>DERNIÈRE POSITION</span><span>ACTION</span></div>
        <div className="ds-gps-list">
          {trackingRunners.map((runner) => {
            const isLive = Boolean(runner.last_position_at && runner.last_position_at >= now - 2 * 60 * 1000);
            const positionLabel = runner.off_route ? "HORS PARCOURS" : isLive ? "EN DIRECT" : runner.last_position_at ? "HORS LIGNE" : "AUCUNE";
            return <div className="ds-gps-row" key={runner.id}>
              <span><b>#{runner.bib} · {runner.name}</b><small>{runner.status === "active" ? "EN LICE" : "HORS COURSE"}</small></span>
              <span>{runner.code_hint ? <b>••••••{runner.code_hint}</b> : <em>NON GÉNÉRÉ</em>}<small>{runner.code_expires_at ? `Expire ${formatDateTime(runner.code_expires_at)}` : ""}</small></span>
              <span><em className={runner.last_seen_at ? "gps-device-connected" : ""}>{runner.last_seen_at ? "ASSOCIÉ" : "EN ATTENTE"}</em><small>{runner.last_seen_at ? formatRelative(runner.last_seen_at, now) : ""}</small></span>
              <span><em className={runner.off_route ? "gps-off-route" : isLive ? "gps-live" : ""}><i />{positionLabel}</em><small>{runner.last_position_at ? `${formatRelative(runner.last_position_at, now)}${runner.distance_from_route_m !== null ? ` · écart ${runner.distance_from_route_m} m` : ""}` : ""}</small></span>
              <button disabled={trackingBusyId !== null || runner.status !== "active"} type="button" onClick={() => void generateGpsCode(runner)}>{trackingBusyId === runner.id ? "CRÉATION…" : runner.code_hint ? "RÉGÉNÉRER" : "GÉNÉRER"}</button>
            </div>;
          })}
        </div>
      </section>
    </main>
  );
}

async function api(url: string, init: RequestInit) { const response = await fetch(url, init); const payload = await response.json() as { error?: string }; if (response.status === 401) window.location.assign("/login?returnTo=/ds"); if (!response.ok) throw new Error(payload.error || "Opération impossible."); return payload; }
function parseLapTime(value?: string) { if (!value?.trim()) return undefined; const parts = value.split(":").map(Number); if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part)) || parts[1] < 0 || parts[1] > 59) throw new Error("Utilise le format MM:SS."); return parts[0] * 60 + parts[1]; }
function formatCountdown(total: number) { const minutes = Math.floor(total / 60).toString().padStart(2, "0"); const seconds = (total % 60).toString().padStart(2, "0"); return `${minutes}:${seconds}`; }
function formatLap(total: number) { return `${Math.floor(total / 60).toString().padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`; }
function formatClock(value: number) { return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value); }
function formatTime(value: number) { return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(value); }
function formatDateTime(value: number) { return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(value); }
function formatRelative(value: number, now: number) { const seconds = Math.max(0, Math.floor((now - value) / 1000)); if (seconds < 60) return `il y a ${seconds} s`; const minutes = Math.floor(seconds / 60); if (minutes < 60) return `il y a ${minutes} min`; return `il y a ${Math.floor(minutes / 60)} h`; }
function initials(name: string) { return name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
