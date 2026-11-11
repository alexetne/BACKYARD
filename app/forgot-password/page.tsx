"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email") }),
      });
      const payload = await response.json() as { message?: string };
      setMessage(payload.message || "Si ce compte existe, un e-mail vient d’être envoyé.");
    } catch { setMessage("La demande n’a pas pu être transmise. Réessaie dans quelques instants."); }
    finally { setBusy(false); }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand-panel"><Link className="brand" href="/"><span className="brand-mark">⌁</span><span>LAST LOOP</span></Link><div><div className="eyebrow">NOUVEAU DÉPART</div><h1>Retrouve<br />ton accès.</h1></div><p>Un lien personnel et temporaire sera envoyé à l’adresse associée au compte.</p></section>
      <section className="auth-form-panel"><form className="auth-form" onSubmit={submit}><div><div className="eyebrow">MOT DE PASSE OUBLIÉ</div><h2>On s’en occupe.</h2></div>{message && <div className="admin-message" role="status">{message}</div>}<label>Adresse e-mail<input name="email" type="email" autoComplete="email" required /></label><button className="primary-action" disabled={busy} type="submit">{busy ? "Envoi…" : "Recevoir un lien"}<span>→</span></button><Link className="back-link" href="/login">← Retour à la connexion</Link></form></section>
    </main>
  );
}
