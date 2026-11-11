"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SessionMenu } from "../components/SessionMenu";
import type { DashboardEvent, EventSummary, UserRole } from "../../lib/types";

type ManagedUser = {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  participant_id: number | null;
  participant_name: string | null;
  participant_bib: number | null;
  account_status: "pending" | "invited" | "active" | "disabled";
  profile_slug: string | null;
  profile_public: number | null;
  profile_approved_at: number | null;
};

function defaultStartDate() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function DirectorPage() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [activeEvent, setActiveEvent] = useState<DashboardEvent | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [infinite, setInfinite] = useState(true);
  const [accountRole, setAccountRole] = useState<UserRole>("runner");
  const [message, setMessage] = useState("");
  const [previewLink, setPreviewLink] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [eventsResponse, activeResponse, usersResponse] = await Promise.all([
      fetch("/api/events", { cache: "no-store" }),
      fetch("/api/events/active", { cache: "no-store" }),
      fetch("/api/users", { cache: "no-store" }),
    ]);
    if (eventsResponse.status === 401 || usersResponse.status === 401) return window.location.assign("/login?returnTo=/director");
    const eventsPayload = await eventsResponse.json() as { events?: EventSummary[] };
    const activePayload = await activeResponse.json() as { event?: DashboardEvent };
    const usersPayload = await usersResponse.json() as { users?: ManagedUser[] };
    setEvents(eventsPayload.events ?? []); setActiveEvent(activePayload.event ?? null); setUsers(usersPayload.users ?? []);
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [refresh]);

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setPreviewLink("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement); const file = form.get("gpx") as File;
    try {
      if (!file?.size) throw new Error("Choisis le fichier GPX du parcours.");
      await api("/api/events", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"), location: form.get("location"),
          startAt: new Date(String(form.get("startAt"))).getTime(),
          loopDistanceKm: Number(form.get("loopDistanceKm")),
          totalLoops: infinite ? null : Number(form.get("totalLoops")),
          gpxName: file.name, gpxText: await file.text(),
        }),
      });
      formElement.reset(); setInfinite(true); setMessage("Événement créé et activé."); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Création impossible."); }
    finally { setBusy(false); }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"), email: form.get("email"), password: accountRole === "runner" ? null : form.get("password"), role: accountRole,
          participantId: accountRole === "runner" ? Number(form.get("participantId")) : null,
        }),
      });
      event.currentTarget.reset(); setAccountRole("runner");
      setMessage(accountRole === "runner" ? "Dossier coureur créé. Vérifie-le puis utilise « Valider & inviter »." : "Compte créé. Il peut se connecter immédiatement.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Création du compte impossible."); }
    finally { setBusy(false); }
  }

  async function activateEvent(id: number) {
    setBusy(true);
    try { await api(`/api/events/${id}/activate`, { method: "POST" }); setMessage("Événement actif mis à jour."); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Activation impossible."); }
    finally { setBusy(false); }
  }

  async function inviteRunner(id: number) {
    setBusy(true); setMessage(""); setPreviewLink("");
    try {
      const payload = await api<{ message?: string; previewLink?: string | null; error?: string }>(`/api/users/${id}/invite`, { method: "POST" });
      setMessage(payload.message || "Invitation envoyée."); setPreviewLink(payload.previewLink ?? ""); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Invitation impossible."); }
    finally { setBusy(false); }
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <Link className="brand" href="/"><span className="brand-mark">⌁</span><span>LAST LOOP</span></Link>
        <SessionMenu />
      </header>
      <section className="admin-intro compact-intro">
        <div className="eyebrow">ESPACE DIRECTION DE COURSE</div>
        <h1>Décide.<br />Configure. Lance.</h1>
        <p>La direction crée les événements et distribue les accès. Le chronométrage reste séparé dans l’espace admin.</p>
      </section>
      {message && <div className="admin-message" role="status">{message}{previewLink && <a className="dev-invite-link" href={previewLink}>Ouvrir le lien d’activation local ↗</a>}</div>}

      <section className="admin-grid director-grid">
        <article className="admin-panel">
          <div className="panel-heading"><span>01</span><div><div className="eyebrow">NOUVEL ÉVÉNEMENT</div><h2>Paramètres & GPX</h2></div></div>
          <form className="admin-form" onSubmit={createEvent}>
            <label>Nom de l’événement<input name="name" required placeholder="Backyard de la Forêt" /></label>
            <label>Lieu<input name="location" required placeholder="Fontainebleau, FR" /></label>
            <label>Date et heure de départ<input name="startAt" type="datetime-local" required defaultValue={defaultStartDate()} /></label>
            <div className="form-row">
              <label>Distance d’une boucle (km)<input name="loopDistanceKm" type="number" step="0.001" min="0.1" required defaultValue="6.706" /></label>
              <label>Nombre de boucles<input name="totalLoops" type="number" min="1" disabled={infinite} placeholder="24" /></label>
            </div>
            <label className="check-label"><input type="checkbox" checked={infinite} onChange={(event) => setInfinite(event.target.checked)} /> Format infini</label>
            <label className="file-drop">Tracé du parcours (.gpx)<input name="gpx" type="file" accept=".gpx,application/gpx+xml" required /><span>Choisir un fichier GPX <b>↗</b></span><small>2 Mo maximum · stocké avec l’événement</small></label>
            <button className="primary-action" disabled={busy} type="submit">{busy ? "Enregistrement…" : "Créer et activer"}<span>→</span></button>
          </form>
        </article>

        <article className="admin-panel">
          <div className="panel-heading"><span>02</span><div><div className="eyebrow">ACCÈS & RÔLES</div><h2>Créer un compte</h2></div></div>
          <form className="admin-form account-form" onSubmit={createAccount}>
            <div className="role-choice" role="group" aria-label="Rôle du compte">
              {(["runner", "admin", "director"] as UserRole[]).map((role) => <button className={accountRole === role ? "active" : ""} onClick={() => setAccountRole(role)} type="button" key={role}>{roleLabel(role)}</button>)}
            </div>
            <label>Nom complet<input name="name" required /></label>
            <label>Adresse e-mail<input name="email" type="email" autoComplete="off" required /></label>
            {accountRole !== "runner" && <label>Mot de passe initial<input name="password" type="password" autoComplete="new-password" minLength={12} required /><small>12 caractères minimum</small></label>}
            {accountRole === "runner" && <label>Coureur associé<select name="participantId" required defaultValue=""><option value="" disabled>Choisir un participant</option>{activeEvent?.runners.map((runner) => <option value={runner.id} key={runner.id}>#{runner.bib} · {runner.name}</option>)}</select></label>}
            {accountRole === "runner" && <p className="form-note">Le coureur ne reçoit pas de mot de passe temporaire. Après validation du dossier, un lien personnel lui permet de choisir le sien.</p>}
            <button className="primary-action" disabled={busy} type="submit">{accountRole === "runner" ? "Créer le dossier" : "Créer le compte"}<span>→</span></button>
          </form>
          <div className="user-list">
            {users.map((user) => <div className="user-row" key={user.id}>
              <span className={`role-pill role-${user.role}`}>{roleLabel(user.role)}</span>
              <span><b>{user.name}</b><small>{user.email}{user.participant_name ? ` · #${user.participant_bib} ${user.participant_name}` : ""}</small><em className={`account-status status-${user.account_status}`}>{accountStatusLabel(user.account_status)}</em></span>
              {user.role === "runner" && <span className="user-actions">
                {user.profile_slug && user.profile_public === 1 && user.profile_approved_at && <Link href={`/runners/${user.profile_slug}`}>Profil ↗</Link>}
                <button disabled={busy} onClick={() => void inviteRunner(user.id)} type="button">{user.account_status === "pending" ? "Valider & inviter" : "Renvoyer le lien"}</button>
              </span>}
            </div>)}
          </div>
        </article>
      </section>

      <section className="event-archive">
        <div className="eyebrow">TOUS LES ÉVÉNEMENTS</div>
        {events.map((event) => <div className="archive-row" key={event.id}><span>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(event.startAt)}</span><b>{event.name}</b><span>{event.location}</span>{event.isActive ? <em>ACTIF</em> : <button disabled={busy} onClick={() => void activateEvent(event.id)} type="button">Activer</button>}</div>)}
      </section>
    </main>
  );
}

async function api<T extends { error?: string } = { error?: string }>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init); const payload = await response.json() as T;
  if (response.status === 401) window.location.assign("/login?returnTo=/director");
  if (!response.ok) throw new Error(payload.error || "Une erreur est survenue.");
  return payload;
}

function accountStatusLabel(status: ManagedUser["account_status"]) {
  if (status === "pending") return "DOSSIER À VALIDER";
  if (status === "invited") return "INVITATION ENVOYÉE";
  if (status === "disabled") return "DÉSACTIVÉ";
  return "ACTIF";
}

function roleLabel(role: UserRole) {
  if (role === "director") return "DIRECTION";
  if (role === "admin") return "ADMIN";
  return "COUREUR";
}
