"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AuthUser } from "../../lib/types";

export function SessionMenu() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const pathname = usePathname();

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

  const links = [
    ...(user.role === "director" ? [{ href: "/ds", label: "Dashboard DS" }, { href: "/director", label: "Configuration" }] : []),
    ...(user.role === "director" || user.role === "admin" ? [{ href: "/admin", label: "Chronométrage" }] : []),
    ...(user.role === "runner" ? [{ href: "/runner", label: "Mon espace" }] : []),
  ];

  return (
    <div className="session-menu">
      <nav className="session-desktop-links" aria-label="Navigation de l’espace privé">
        {links.map((link) => pathname === link.href
          ? <span className="session-current" aria-current="page" key={link.href}>{link.label}</span>
          : <Link href={link.href} key={link.href}>{link.label}</Link>)}
        <Link href="/display">Écran camp</Link>
      </nav>
      <span className={`role-pill role-${user.role} session-identity`}>{roleLabel(user.role)}</span>
      <b className="session-identity">{user.name}</b>
      <button className="session-logout" type="button" onClick={() => void logout()}>Déconnexion</button>
      <details className="session-mobile-menu">
        <summary>Menu</summary>
        <div>
          <strong>{user.name}</strong>
          {links.map((link) => pathname === link.href
            ? <span className="session-current" aria-current="page" key={link.href}>{link.label}</span>
            : <Link href={link.href} key={link.href}>{link.label}</Link>)}
          <Link href="/display">Écran camp →</Link>
          <button type="button" onClick={() => void logout()}>Déconnexion</button>
        </div>
      </details>
    </div>
  );
}

function roleLabel(role: AuthUser["role"]) {
  if (role === "director") return "DIRECTION";
  if (role === "admin") return "ADMIN";
  return "COUREUR";
}
