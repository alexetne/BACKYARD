"use client";

import { useEffect, useMemo, useState } from "react";

type Runner = {
  rank: number;
  name: string;
  bib: number;
  laps: number;
  distance: string;
  lastLap: string;
  status: "course" | "arrive" | "abandon";
  country: string;
};

const runners: Runner[] = [
  { rank: 1, name: "Amélie Roux", bib: 27, laps: 18, distance: "120,7", lastLap: "52:18", status: "arrive", country: "FR" },
  { rank: 2, name: "Jonas Berg", bib: 14, laps: 18, distance: "120,7", lastLap: "53:42", status: "arrive", country: "SE" },
  { rank: 3, name: "Léon Marchal", bib: 42, laps: 18, distance: "120,7", lastLap: "—", status: "course", country: "FR" },
  { rank: 4, name: "Sofia Benali", bib: 8, laps: 18, distance: "120,7", lastLap: "—", status: "course", country: "BE" },
  { rank: 5, name: "Milo Andersen", bib: 31, laps: 18, distance: "120,7", lastLap: "—", status: "course", country: "DK" },
  { rank: 6, name: "Nina Keller", bib: 19, laps: 17, distance: "114,0", lastLap: "59:21", status: "abandon", country: "CH" },
];

const updates = [
  { time: "17:07", title: "Jonas Berg boucle le tour", detail: "Tour 18 · 53:42", tone: "lime" },
  { time: "17:06", title: "Amélie Roux est de retour", detail: "Tour 18 · 52:18", tone: "lime" },
  { time: "17:02", title: "Nina Keller abandonne", detail: "Après 17 tours · 114,0 km", tone: "orange" },
  { time: "16:15", title: "Départ du tour 18", detail: "23 participants au départ", tone: "dark" },
];

const filters = ["Tous", "En course", "Arrivés"];

function formatCountdown(total: number) {
  const minutes = Math.floor(total / 60).toString().padStart(2, "0");
  const seconds = (total % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export default function Home() {
  const [secondsLeft, setSecondsLeft] = useState(31 * 60 + 42);
  const [filter, setFilter] = useState("Tous");
  const [followed, setFollowed] = useState<number[]>([27]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSecondsLeft((value) => (value > 0 ? value - 1 : 60 * 60));
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const visibleRunners = useMemo(() => {
    if (filter === "En course") return runners.filter((runner) => runner.status === "course");
    if (filter === "Arrivés") return runners.filter((runner) => runner.status === "arrive");
    return runners;
  }, [filter]);

  function toggleFollow(bib: number) {
    setFollowed((current) => current.includes(bib) ? current.filter((item) => item !== bib) : [...current, bib]);
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Last Loop, accueil">
          <span className="brand-mark" aria-hidden="true">⌁</span>
          <span>LAST LOOP</span>
        </a>
        <div className="event-switcher" aria-label="Événement en cours">
          <span className="event-date">04–05 OCT.</span>
          <span className="event-name">Backyard de la Forêt</span>
          <span className="chevron" aria-hidden="true">⌄</span>
        </div>
        <nav className="nav-actions" aria-label="Navigation principale">
          <a href="#classement">Classement</a>
          <a href="#parcours">Parcours</a>
          <button className="share-button" type="button" onClick={() => navigator.clipboard?.writeText(window.location.href)}>
            Partager <span aria-hidden="true">↗</span>
          </button>
        </nav>
      </header>

      <div className="page-shell" id="top">
        <section className="event-heading">
          <div>
            <div className="eyebrow"><span className="live-dot" /> LIVE · ÉDITION 2026</div>
            <h1>Backyard de<br />la Forêt</h1>
          </div>
          <div className="event-meta">
            <p>Forêt de Fontainebleau, FR</p>
            <p>Départ samedi à 00:00</p>
            <div className="weather"><span aria-hidden="true">☼</span> 12° <span className="muted">· Sec · Vent faible</span></div>
          </div>
        </section>

        <section className="live-grid" aria-label="Résumé de la course">
          <article className="countdown-card">
            <div className="card-kicker">PROCHAIN DÉPART</div>
            <div className="countdown">{formatCountdown(secondsLeft)}</div>
            <div className="countdown-footer">
              <span>Tour 19</span>
              <span>Départ à 18:00</span>
            </div>
            <div className="progress-track" aria-hidden="true"><span style={{ width: `${(secondsLeft / 3600) * 100}%` }} /></div>
          </article>

          <article className="stat-card lime-card">
            <div className="card-kicker">TOUR EN COURS</div>
            <strong>18</strong>
            <div className="stat-bottom"><span>120,7 km</span><span>↗</span></div>
          </article>

          <article className="stat-card dark-card">
            <div className="card-kicker">ENCORE EN LICE</div>
            <strong>23</strong>
            <div className="stat-bottom"><span>sur 64 au départ</span><span className="trend">−4</span></div>
          </article>
        </section>

        <section className="content-grid">
          <article className="leaderboard" id="classement">
            <div className="section-title-row">
              <div>
                <div className="eyebrow">CLASSEMENT EN DIRECT</div>
                <h2>Les derniers debout.</h2>
              </div>
              <div className="filters" role="group" aria-label="Filtrer le classement">
                {filters.map((item) => (
                  <button key={item} className={filter === item ? "active" : ""} type="button" onClick={() => setFilter(item)}>{item}</button>
                ))}
              </div>
            </div>

            <div className="runner-table" role="table" aria-label="Classement des participants">
              <div className="runner-row table-head" role="row">
                <span>POS.</span><span>ATHLÈTE</span><span>TOURS</span><span>DISTANCE</span><span>DERNIER TOUR</span><span>STATUT</span><span />
              </div>
              {visibleRunners.map((runner) => (
                <div className={`runner-row ${runner.status === "abandon" ? "is-out" : ""}`} role="row" key={runner.bib}>
                  <span className="rank">{runner.rank.toString().padStart(2, "0")}</span>
                  <span className="athlete">
                    <span className="avatar">{runner.name.split(" ").map((part) => part[0]).join("")}</span>
                    <span><b>{runner.name}</b><small>#{runner.bib} · {runner.country}</small></span>
                  </span>
                  <span data-label="Tours"><b>{runner.laps}</b></span>
                  <span data-label="Distance">{runner.distance} <small>km</small></span>
                  <span data-label="Dernier tour" className="mono">{runner.lastLap}</span>
                  <span data-label="Statut"><span className={`status status-${runner.status}`}><i />{runner.status === "course" ? "EN COURSE" : runner.status === "arrive" ? "ARRIVÉ" : "ABANDON"}</span></span>
                  <button className={`follow ${followed.includes(runner.bib) ? "is-followed" : ""}`} type="button" onClick={() => toggleFollow(runner.bib)} aria-label={`${followed.includes(runner.bib) ? "Ne plus suivre" : "Suivre"} ${runner.name}`} aria-pressed={followed.includes(runner.bib)}>
                    {followed.includes(runner.bib) ? "★" : "☆"}
                  </button>
                </div>
              ))}
            </div>
            <button className="view-all" type="button">Voir les 64 participants <span>→</span></button>
          </article>

          <aside className="live-feed" aria-label="Fil de course en direct">
            <div className="feed-heading">
              <div><span className="live-dot" /> FIL DE COURSE</div>
              <span>AUTO</span>
            </div>
            <div className="feed-list">
              {updates.map((update, index) => (
                <div className="feed-item" key={`${update.time}-${update.title}`}>
                  <div className={`feed-marker ${update.tone}`}><span /></div>
                  <time>{update.time}</time>
                  <div><b>{update.title}</b><p>{update.detail}</p></div>
                  {index === 0 && <span className="new-label">NEW</span>}
                </div>
              ))}
            </div>
            <button className="feed-button" type="button">Ouvrir le fil complet <span>↗</span></button>
          </aside>
        </section>

        <section className="course-card" id="parcours">
          <div className="course-copy">
            <div className="eyebrow">LA BOUCLE</div>
            <h2>6,706 km.<br />Encore. Et encore.</h2>
            <p>Une boucle forestière rapide, avec une longue montée au troisième kilomètre. Chaque tour doit être terminé en moins d’une heure.</p>
            <div className="course-stats">
              <span><b>+92 m</b><small>DÉNIVELÉ</small></span>
              <span><b>64%</b><small>SENTIER</small></span>
              <span><b>36%</b><small>ROUTE</small></span>
            </div>
          </div>
          <div className="elevation" aria-label="Profil d'élévation du parcours">
            <div className="elevation-label top">142 m</div>
            <div className="profile-bars" aria-hidden="true">
              {[20, 24, 21, 28, 35, 41, 52, 67, 78, 74, 61, 55, 49, 44, 36, 30, 33, 28, 25, 22, 18].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
            </div>
            <div className="elevation-label bottom">82 m</div>
            <div className="distance-axis"><span>0</span><span>2 km</span><span>4 km</span><span>6,7 km</span></div>
          </div>
        </section>

        <footer>
          <div className="brand footer-brand"><span className="brand-mark" aria-hidden="true">⌁</span><span>LAST LOOP</span></div>
          <p>Le suivi live des courses qui ne s’arrêtent jamais.</p>
          <span>Données de démonstration · Mise à jour 17:28:18</span>
        </footer>
      </div>
    </main>
  );
}
