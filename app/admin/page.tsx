"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SessionMenu } from "../components/SessionMenu";
import type { DashboardEvent } from "../../lib/types";

export default function AdminPage() {
  const [activeEvent, setActiveEvent] = useState<DashboardEvent | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [lapTimes, setLapTimes] = useState<Record<number, string>>({});

  const refresh = useCallback(async () => {
    const response = await fetch("/api/events/active", { cache: "no-store" });
    const payload = await response.json() as { event?: DashboardEvent };
    setActiveEvent(payload.event ?? null);
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 10_000);
    return () => { window.clearTimeout(initialLoad); window.clearInterval(interval); };
  }, [refresh]);

  async function addRunner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeEvent) return;
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/participants", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: activeEvent.id, bib: Number(form.get("bib")), name: form.get("name"), country: form.get("country") }),
      });
      event.currentTarget.reset(); setMessage("Coureur ajouté."); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Ajout impossible."); }
    finally { setBusy(false); }
  }

  async function recordLap(participantId: number) {
    setBusy(true);
    try {
      await api("/api/laps", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId, durationSeconds: parseLapTime(lapTimes[participantId]) }),
      });
      setLapTimes((current) => ({ ...current, [participantId]: "" })); setMessage("Tour enregistré."); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Tour non enregistré."); }
    finally { setBusy(false); }
  }

  async function setRunnerOut(participantId: number) {
    setBusy(true);
    try {
      await api(`/api/participants/${participantId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "out" }),
      });
      setMessage("Abandon enregistré."); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Mise à jour impossible."); }
    finally { setBusy(false); }
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <Link className="brand" href="/"><span className="brand-mark">⌁</span><span>LAST LOOP</span></Link>
        <SessionMenu />
      </header>
      <section className="admin-intro compact-intro">
        <div className="eyebrow">ESPACE ADMIN · CHRONOMÉTRAGE</div>
        <h1>Chaque tour.<br />À la seconde.</h1>
        <p>Inscris les coureurs, valide leurs passages et enregistre les abandons. La direction conserve la gestion des événements et des accès.</p>
      </section>
      {message && <div className="admin-message" role="status">{message}</div>}

      <section className="single-control-panel">
        <article className="admin-panel control-panel">
          <div className="panel-heading"><span>01</span><div><div className="eyebrow">COURSE ACTIVE</div><h2>{activeEvent?.name ?? "Aucun événement"}</h2></div></div>
          {activeEvent ? (
            <>
              <div className="admin-event-stats">
                <span><b>{activeEvent.stats.currentLap}</b><small>TOUR ACTUEL</small></span>
                <span><b>{activeEvent.stats.activeRunners}</b><small>EN LICE</small></span>
                <span><b>{activeEvent.runners.length}</b><small>INSCRITS</small></span>
              </div>
              <form className="runner-add-form" onSubmit={addRunner}>
                <input name="bib" type="number" min="1" required placeholder="Dossard" aria-label="Dossard" />
                <input name="name" required placeholder="Nom du coureur" aria-label="Nom du coureur" />
                <input name="country" defaultValue="FR" maxLength={3} required aria-label="Pays" />
                <button disabled={busy} type="submit">Ajouter +</button>
              </form>
              <div className="admin-runner-list">
                {activeEvent.runners.length === 0 && <p className="empty-state">Ajoute le premier coureur pour démarrer le classement.</p>}
                {activeEvent.runners.map((runner) => (
                  <div className={`admin-runner ${runner.state === "abandon" ? "runner-out" : ""}`} key={runner.id}>
                    <span className="admin-bib">#{runner.bib}</span>
                    <span className="admin-runner-name"><b>{runner.name}</b><small>{runner.laps} tour{runner.laps > 1 ? "s" : ""} · {runner.country}</small></span>
                    {runner.state !== "abandon" && <>
                      <input value={lapTimes[runner.id] ?? ""} onChange={(event) => setLapTimes((current) => ({ ...current, [runner.id]: event.target.value }))} placeholder="55:00" aria-label={`Temps du tour de ${runner.name}`} />
                      <button disabled={busy} onClick={() => void recordLap(runner.id)} type="button">Valider tour</button>
                      <button className="danger-action" disabled={busy} onClick={() => void setRunnerOut(runner.id)} type="button">Abandon</button>
                    </>}
                  </div>
                ))}
              </div>
            </>
          ) : <p className="empty-state">La direction doit d’abord créer ou activer un événement.</p>}
        </article>
      </section>
    </main>
  );
}

async function api(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json() as { error?: string };
  if (response.status === 401) window.location.assign("/login?returnTo=/admin");
  if (!response.ok) throw new Error(payload.error || "Une erreur est survenue.");
  return payload;
}

function parseLapTime(value?: string) {
  if (!value?.trim()) return undefined;
  const parts = value.split(":").map(Number);
  if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part))) throw new Error("Utilise le format MM:SS.");
  return parts[0] * 60 + parts[1];
}
