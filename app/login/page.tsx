"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import type { AuthUser } from "../../lib/types";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const payload = await response.json() as { user?: AuthUser; error?: string };
      if (response.status === 428) return window.location.assign("/setup");
      if (!response.ok || !payload.user) throw new Error(payload.error || "Connexion impossible.");

      const returnTo = new URLSearchParams(window.location.search).get("returnTo");
      const safeReturnTo = returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : null;
      window.location.assign(safeReturnTo || homeForRole(payload.user.role));
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <Link className="brand" href="/"><span className="brand-mark">⌁</span><span>LAST LOOP</span></Link>
        <div><div className="eyebrow">ACCÈS SÉCURISÉ</div><h1>Retourne<br />dans la course.</h1></div>
        <p>Coureurs, chronométreurs et direction accèdent chacun à leur espace dédié.</p>
      </section>
      <section className="auth-form-panel">
        <form className="auth-form" onSubmit={submit}>
          <div><div className="eyebrow">CONNEXION</div><h2>Bienvenue.</h2></div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <label>Adresse e-mail<input name="email" type="email" autoComplete="email" required /></label>
          <label>Mot de passe<input name="password" type="password" autoComplete="current-password" required /></label>
          <Link className="password-help-link" href="/forgot-password">Mot de passe oublié ?</Link>
          <button className="primary-action" disabled={busy} type="submit">{busy ? "Connexion…" : "Se connecter"}<span>→</span></button>
          <Link className="back-link" href="/">← Retour au live public</Link>
        </form>
      </section>
    </main>
  );
}

function homeForRole(role: AuthUser["role"]) {
  if (role === "director") return "/director";
  if (role === "admin") return "/admin";
  return "/runner";
}
