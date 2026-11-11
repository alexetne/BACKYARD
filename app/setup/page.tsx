"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

export default function SetupPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const response = await fetch("/api/auth/setup", { cache: "no-store" });
      const payload = await response.json() as { needsSetup: boolean };
      if (!payload.needsSetup) window.location.replace("/login");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== form.get("confirmation")) {
      setBusy(false);
      return setError("Les deux mots de passe ne correspondent pas.");
    }
    try {
      const response = await fetch("/api/auth/setup", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), email: form.get("email"), password }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Configuration impossible.");
      window.location.assign("/director");
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : "Configuration impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand-panel setup-brand-panel">
        <Link className="brand" href="/"><span className="brand-mark">⌁</span><span>LAST LOOP</span></Link>
        <div><div className="eyebrow">PREMIER DÉMARRAGE</div><h1>Prends<br />la direction.</h1></div>
        <p>Ce premier compte sera le directeur de course et pourra ensuite créer les accès admin et coureur.</p>
      </section>
      <section className="auth-form-panel">
        <form className="auth-form" onSubmit={submit}>
          <div><div className="eyebrow">COMPTE PRINCIPAL</div><h2>Créer le directeur.</h2></div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <label>Nom complet<input name="name" autoComplete="name" required /></label>
          <label>Adresse e-mail<input name="email" type="email" autoComplete="email" required /></label>
          <label>Mot de passe<input name="password" type="password" autoComplete="new-password" minLength={12} required /><small>12 caractères minimum</small></label>
          <label>Confirmer le mot de passe<input name="confirmation" type="password" autoComplete="new-password" minLength={12} required /></label>
          <button className="primary-action" disabled={busy} type="submit">{busy ? "Création…" : "Créer l’espace direction"}<span>→</span></button>
        </form>
      </section>
    </main>
  );
}
