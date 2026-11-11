"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

const QUEUE_KEY = "last_loop_gps_queue_v1";
const MAX_QUEUED_POSITIONS = 720;
const MIN_SAMPLE_INTERVAL_MS = 8_000;

type TrackingDevice = {
  id: number;
  eventId: number;
  participantId: number;
  expiresAt: number;
  runnerName: string;
  bib: number;
  eventName: string;
  participantStatus: "active" | "out" | "dns";
};

type QueuedPosition = {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  recordedAt: number;
};

type WakeLockSentinelLike = {
  released: boolean;
  release(): Promise<void>;
};

type RouteStatus = { distanceM: number; thresholdM: number; offRoute: boolean };

type TrackingAlert = {
  id: number;
  kind: "assistance" | "urgent";
  message: string;
  status: "open" | "acknowledged" | "resolved";
  created_at: number;
  acknowledged_at: number | null;
  resolved_at: number | null;
};

export default function TrackPage() {
  const [checking, setChecking] = useState(true);
  const [device, setDevice] = useState<TrackingDevice | null>(null);
  const [code, setCode] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [online, setOnline] = useState(true);
  const [visible, setVisible] = useState(true);
  const [queuedCount, setQueuedCount] = useState(0);
  const [lastPosition, setLastPosition] = useState<QueuedPosition | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [routeStatus, setRouteStatus] = useState<RouteStatus | null>(null);
  const [alertMessage, setAlertMessage] = useState("");
  const [activeAlert, setActiveAlert] = useState<TrackingAlert | null>(null);
  const [alertBusy, setAlertBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const flushingRef = useRef(false);
  const lastSampleAtRef = useRef(0);
  const trackingRef = useRef(false);

  const stopLocalTracking = useCallback(async () => {
    if (watchIdRef.current !== null) navigator.geolocation?.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    trackingRef.current = false;
    setTracking(false);
    const wakeLock = wakeLockRef.current;
    wakeLockRef.current = null;
    if (wakeLock && !wakeLock.released) await wakeLock.release().catch(() => undefined);
  }, []);

  const flushQueue = useCallback(async () => {
    if (flushingRef.current || !navigator.onLine) return;
    flushingRef.current = true;
    try {
      while (navigator.onLine) {
        const queue = readQueue();
        if (!queue.length) break;
        const batch = queue.slice(0, 30);
        const response = await fetch("/api/tracking/positions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ positions: batch }),
        });
        if (response.status === 401) {
          setDevice(null);
          await stopLocalTracking();
          setError("Cette liaison GPS n’est plus valide. Demande un nouveau code à la direction.");
          return;
        }
        const payload = await response.json() as { error?: string; route?: RouteStatus | null };
        if (!response.ok) throw new Error(payload.error || "Synchronisation impossible.");
        if (payload.route) setRouteStatus(payload.route);
        const sentKeys = new Set(batch.map(positionKey));
        const remaining = readQueue().filter((position) => !sentKeys.has(positionKey(position)));
        writeQueue(remaining);
        setQueuedCount(remaining.length);
        setLastSyncAt(Date.now());
        setMessage(remaining.length ? `${remaining.length} point${remaining.length > 1 ? "s" : ""} encore en attente.` : "Position synchronisée.");
      }
    } catch {
      setMessage("Réseau indisponible : les positions restent en attente sur ce téléphone.");
    } finally {
      flushingRef.current = false;
    }
  }, [stopLocalTracking]);

  const requestWakeLock = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    const wakeLockApi = (navigator as Navigator & {
      wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
    }).wakeLock;
    if (!wakeLockApi || (wakeLockRef.current && !wakeLockRef.current.released)) return;
    try {
      wakeLockRef.current = await wakeLockApi.request("screen");
    } catch {
      setMessage("Le téléphone n’autorise pas le maintien de l’écran. Désactive son verrouillage automatique.");
    }
  }, []);

  useEffect(() => {
    const initializeState = window.setTimeout(() => {
      setOnline(navigator.onLine);
      setVisible(document.visibilityState === "visible");
      setQueuedCount(readQueue().length);
    }, 0);
    const loadSession = async () => {
      try {
        const response = await fetch("/api/tracking/session", { cache: "no-store" });
        const payload = await response.json() as { connected?: boolean; device?: TrackingDevice };
        if (response.ok && payload.connected && payload.device) setDevice(payload.device);
      } finally {
        setChecking(false);
      }
    };
    void loadSession();
    return () => window.clearTimeout(initializeState);
  }, []);

  useEffect(() => {
    const onOnline = () => { setOnline(true); setMessage("Connexion retrouvée, synchronisation…"); void flushQueue(); };
    const onOffline = () => { setOnline(false); setMessage("Mode hors ligne : les positions sont conservées sur ce téléphone."); };
    const onVisibility = () => {
      const isVisible = document.visibilityState === "visible";
      setVisible(isVisible);
      if (isVisible && trackingRef.current) {
        void requestWakeLock();
        void flushQueue();
      }
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [flushQueue, requestWakeLock]);

  useEffect(() => {
    if (!device) return;
    const loadAlerts = async () => {
      const response = await fetch("/api/tracking/alerts?mine=1", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { alerts?: TrackingAlert[] };
      setActiveAlert(payload.alerts?.[0] ?? null);
    };
    const initial = window.setTimeout(() => void loadAlerts(), 0);
    const interval = window.setInterval(() => void loadAlerts(), 5_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [device]);

  useEffect(() => () => {
    if (watchIdRef.current !== null) navigator.geolocation?.clearWatch(watchIdRef.current);
    void wakeLockRef.current?.release().catch(() => undefined);
  }, []);

  async function connect(event: FormEvent) {
    event.preventDefault();
    setConnecting(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/tracking/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = await response.json() as { device?: TrackingDevice; error?: string };
      if (!response.ok || !payload.device) throw new Error(payload.error || "Code non reconnu.");
      setDevice(payload.device); setCode("");
      setMessage("Téléphone associé. Lance le suivi au moment du départ.");
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Connexion impossible.");
    } finally {
      setConnecting(false);
    }
  }

  async function startTracking() {
    setError(""); setMessage("");
    if (!window.isSecureContext || !navigator.geolocation) {
      setError("La géolocalisation nécessite une page HTTPS (ou localhost) et un navigateur compatible.");
      return;
    }
    trackingRef.current = true;
    setTracking(true);
    await requestWakeLock();
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const recordedAt = Math.round(position.timestamp || Date.now());
        if (recordedAt - lastSampleAtRef.current < MIN_SAMPLE_INTERVAL_MS) return;
        lastSampleAtRef.current = recordedAt;
        const point: QueuedPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: finiteOrNull(position.coords.altitude),
          speed: finiteOrNull(position.coords.speed),
          heading: finiteOrNull(position.coords.heading),
          recordedAt,
        };
        const queue = [...readQueue(), point].slice(-MAX_QUEUED_POSITIONS);
        writeQueue(queue);
        setQueuedCount(queue.length);
        setLastPosition(point);
        setMessage("Position reçue, synchronisation…");
        void flushQueue();
      },
      (positionError) => {
        const reason = positionError.code === positionError.PERMISSION_DENIED
          ? "Autorise la localisation précise dans les réglages du navigateur."
          : positionError.code === positionError.TIMEOUT
            ? "Le signal GPS tarde. La recherche continue automatiquement."
            : "Signal GPS indisponible pour le moment.";
        setError(reason);
        if (positionError.code === positionError.PERMISSION_DENIED) void stopLocalTracking();
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
  }

  async function disconnect() {
    await stopLocalTracking();
    await fetch("/api/tracking/session", { method: "DELETE" });
    setDevice(null); setMessage(""); setError(""); setLastPosition(null); setLastSyncAt(null); setRouteStatus(null); setActiveAlert(null);
  }

  async function sendAlert(kind: "assistance" | "urgent") {
    const prompt = kind === "urgent"
      ? "Envoyer une alerte URGENTE à la direction de course avec ta dernière position connue ?"
      : "Prévenir la direction que tu as besoin d’assistance ?";
    if (!window.confirm(prompt)) return;
    setAlertBusy(true); setError("");
    try {
      const response = await fetch("/api/tracking/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, message: alertMessage }),
      });
      const payload = await response.json() as { alert?: TrackingAlert; error?: string };
      if (!response.ok || !payload.alert) throw new Error(payload.error || "Alerte non envoyée.");
      setActiveAlert(payload.alert); setAlertMessage("");
      setMessage(kind === "urgent" ? "Alerte urgente transmise à la direction." : "Demande d’assistance transmise à la direction.");
    } catch (alertError) {
      setError(alertError instanceof Error ? alertError.message : "Alerte non envoyée.");
    } finally {
      setAlertBusy(false);
    }
  }

  return (
    <main className="track-page">
      <header className="track-header">
        <Link className="brand" href="/"><span className="brand-mark">⌁</span><span>LAST LOOP</span></Link>
        <span className={`track-network ${online ? "online" : "offline"}`}><i /> {online ? "EN LIGNE" : "HORS LIGNE"}</span>
      </header>

      <section className="track-shell">
        <div className="track-intro">
          <div className="eyebrow">BALISE GPS · JOUR DE COURSE</div>
          <h1>Ton téléphone devient ta balise.</h1>
          <p>Ta position est envoyée sur le parcours public et conservée temporairement pour le suivi de la course.</p>
        </div>

        {checking ? <section className="track-card track-loading"><span className="live-dot" /> Vérification de cet appareil…</section> : !device ? (
          <section className="track-card">
            <div className="track-step">01</div>
            <div className="eyebrow">ASSOCIER CE TÉLÉPHONE</div>
            <h2>Entre ton code coureur.</h2>
            <p>Le directeur de course te remet un code personnel le jour de l’événement.</p>
            <form className="track-code-form" onSubmit={(event) => void connect(event)}>
              <label htmlFor="tracking-code">CODE GPS</label>
              <input id="tracking-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="27-ABCD2345" autoCapitalize="characters" autoComplete="one-time-code" required />
              <button disabled={connecting} type="submit">{connecting ? "VÉRIFICATION…" : "ASSOCIER L’APPAREIL →"}</button>
            </form>
            {error && <div className="track-alert error" role="alert">{error}</div>}
            <div className="track-privacy"><b>Consentement</b><span>En associant l’appareil puis en lançant le suivi, tu acceptes le partage public de ta position pendant la course. Tu peux l’arrêter à tout moment.</span></div>
          </section>
        ) : (
          <section className={`track-card track-connected ${tracking ? "is-tracking" : ""}`}>
            <div className="track-runner-heading">
              <div className="track-bib">#{device.bib}</div>
              <div><div className="eyebrow">{device.eventName}</div><h2>{device.runnerName}</h2><p>Appareil associé jusqu’au {formatDate(device.expiresAt)}.</p></div>
            </div>

            <div className="track-signal">
              <div className="track-pulse"><i /><span>{tracking ? "GPS ACTIF" : "GPS EN PAUSE"}</span></div>
              <dl>
                <div><dt>PAGE</dt><dd>{visible ? "VISIBLE" : "MASQUÉE"}</dd></div>
                <div><dt>PRÉCISION</dt><dd>{lastPosition ? `± ${Math.round(lastPosition.accuracy)} m` : "—"}</dd></div>
                <div><dt>DERNIÈRE POSITION</dt><dd>{lastPosition ? formatTime(lastPosition.recordedAt) : "EN ATTENTE"}</dd></div>
                <div><dt>DERNIER ENVOI</dt><dd>{lastSyncAt ? formatTime(lastSyncAt) : "—"}</dd></div>
                <div><dt>ITINÉRAIRE</dt><dd className={routeStatus?.offRoute ? "track-route-warning" : ""}>{routeStatus ? routeStatus.offRoute ? `ÉCART ${routeStatus.distanceM} m` : "SUR LE TRACÉ" : "—"}</dd></div>
                <div><dt>FILE D’ATTENTE</dt><dd>{queuedCount} POINT{queuedCount > 1 ? "S" : ""}</dd></div>
              </dl>
            </div>

            {error && <div className="track-alert error" role="alert">{error}</div>}
            {message && <div className="track-alert" role="status">{message}</div>}

            {!tracking ? <button className="track-start" type="button" onClick={() => void startTracking()}><span>●</span> DÉMARRER LE SUIVI GPS</button> : <button className="track-stop" type="button" onClick={() => void stopLocalTracking()}>METTRE LE SUIVI EN PAUSE</button>}
            <button className="track-disconnect" type="button" onClick={() => void disconnect()}>Dissocier ce téléphone</button>

            <div className="track-assistance">
              <div><div className="eyebrow">ASSISTANCE COURSE</div><h3>Un problème sur la boucle ?</h3></div>
              {activeAlert && <div className={`track-alert-state ${activeAlert.kind} ${activeAlert.status}`}>
                <b>{activeAlert.kind === "urgent" ? "ALERTE URGENTE" : "DEMANDE D’ASSISTANCE"}</b>
                <span>{activeAlert.status === "open" ? "Envoyée · en attente de prise en charge" : activeAlert.status === "acknowledged" ? "Vue par la direction · prise en charge en cours" : "Clôturée par la direction"}</span>
              </div>}
              <label htmlFor="tracking-alert-message">PRÉCISION FACULTATIVE</label>
              <textarea id="tracking-alert-message" maxLength={240} value={alertMessage} onChange={(event) => setAlertMessage(event.target.value)} placeholder="Ex. douleur à la cheville, besoin d’eau…" />
              <div className="track-assistance-actions"><button disabled={alertBusy} type="button" onClick={() => void sendAlert("assistance")}>BESOIN D’AIDE</button><button disabled={alertBusy} className="urgent" type="button" onClick={() => void sendAlert("urgent")}>URGENCE</button></div>
              <p>Cette fonction prévient uniquement l’organisation de la course. En cas de danger immédiat, appelle directement le 112.</p>
            </div>

            <div className="track-instructions">
              <b>Pour un suivi fiable</b>
              <ol><li>Autorise la localisation précise.</li><li>Laisse cette page visible pendant la boucle.</li><li>Garde le téléphone chargé et évite le mode économie d’énergie.</li></ol>
              <p>Les navigateurs peuvent suspendre le GPS quand la page est masquée ou l’écran verrouillé. Last Loop maintient l’écran allumé quand le téléphone l’autorise et reprend les envois dès ton retour.</p>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function readQueue(): QueuedPosition[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(QUEUE_KEY) || "[]");
    return Array.isArray(value) ? value.filter(isQueuedPosition).slice(-MAX_QUEUED_POSITIONS) : [];
  } catch { return []; }
}

function writeQueue(queue: QueuedPosition[]) {
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function isQueuedPosition(value: unknown): value is QueuedPosition {
  if (!value || typeof value !== "object") return false;
  const position = value as Partial<QueuedPosition>;
  return Number.isFinite(position.latitude) && Number.isFinite(position.longitude) && Number.isFinite(position.accuracy) && Number.isFinite(position.recordedAt);
}

function positionKey(position: QueuedPosition) { return `${position.recordedAt}:${position.latitude}:${position.longitude}`; }
function finiteOrNull(value: number | null) { return value !== null && Number.isFinite(value) ? value : null; }
function formatTime(value: number) { return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value); }
function formatDate(value: number) { return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(value); }
