"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import type { AuthUser } from "../../lib/types";

export default function ResetPasswordPage() {
  const [token] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("token") ?? "");
  const [name, setName] = useState("");
  const [valid, setValid] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, payload: await response.json() as { name?: string; error?: string } }))
      .then(({ ok, payload }) => { setValid(ok); setName(payload.name ?? ""); if (!ok) setError(payload.error || "Ce lien n’est plus valide."); })
      .catch(() => { setValid(false); setError("Ce lien n’a pas pu être vérifié."); });
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== form.get("confirmation")) { setError("Les deux mots de passe ne correspondent pas."); setBusy(false); return; }
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }),
      });
      const payload = await response.json() as { user?: AuthUser; error?: string };
      if (!response.ok || !payload.user) throw new Error(payload.error || "Réinitialisation impossible.");
      window.location.assign(homeForRole(payload.user.role));
    } catch (resetError) { setError(resetError instanceof Error ? resetError.message : "Réinitialisation impossible."); setBusy(false); }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand-panel setup-brand-panel"><Link className="brand" href="/"><span className="brand-mark">⌁</span><span>LAST LOOP</span></Link><div><div className="eyebrow">ACCÈS PERSONNEL</div><h1>Choisis<br />ton secret.</h1></div><p>Le lien ne fonctionne qu’une fois. Ton nouveau mot de passe ferme les anciennes sessions.</p></section>
      <section className="auth-form-panel">
        {valid === null ? <div className="auth-form"><div className="eyebrow">VÉRIFICATION DU LIEN…</div></div> : valid ? <form className="auth-form" onSubmit={submit}><div><div className="eyebrow">BONJOUR {name.toUpperCase()}</div><h2>Nouveau mot de passe.</h2></div>{error && <div className="form-error" role="alert">{error}</div>}<label>Mot de passe<input name="password" type="password" autoComplete="new-password" minLength={12} required /><small>12 caractères minimum</small></label><label>Confirmer<input name="confirmation" type="password" autoComplete="new-password" minLength={12} required /></label><button className="primary-action" disabled={busy} type="submit">{busy ? "Activation…" : "Activer mon compte"}<span>→</span></button></form> : <div className="auth-form"><div><div className="eyebrow">LIEN INDISPONIBLE</div><h2>Il faut repartir.</h2></div><div className="form-error">{error}</div><Link className="primary-action" href="/forgot-password">Demander un nouveau lien <span>→</span></Link></div>}
      </section>
    </main>
  );
}

function homeForRole(role: AuthUser["role"]) { return role === "director" ? "/director" : role === "admin" ? "/admin" : "/runner"; }
