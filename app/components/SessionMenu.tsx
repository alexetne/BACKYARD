"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AuthUser } from "../../lib/types";

export function SessionMenu() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (response.ok) {
        const payload = await response.json() as { user: AuthUser };
        setUser(payload.user);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  if (!user) return <span className="session-loading">SESSION…</span>;

  return (
    <div className="session-menu">
      {user.role === "director" && <Link href="/ds">Dashboard DS</Link>}
      {user.role === "director" && <Link href="/director">Configuration</Link>}
      {(user.role === "director" || user.role === "admin") && <Link href="/admin">Chronométrage</Link>}
      {user.role === "runner" && <Link href="/runner">Mon espace</Link>}
      <Link href="/display" target="_blank" rel="noreferrer">Écran camp</Link>
      <span className={`role-pill role-${user.role}`}>{roleLabel(user.role)}</span>
      <b>{user.name}</b>
      <button type="button" onClick={() => void logout()}>Déconnexion</button>
    </div>
  );
}

function roleLabel(role: AuthUser["role"]) {
  if (role === "director") return "DIRECTION";
  if (role === "admin") return "ADMIN";
  return "COUREUR";
}
