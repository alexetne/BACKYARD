import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Location from "expo-location";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ApiError, connectDevice, disconnectDevice, flushPositionQueue, getMyAlerts, getSession, normalizeApiUrl, sendTrackingAlert } from "./src/api";
import { DEFAULT_API_URL, TRACKING_TASK_NAME } from "./src/constants";
import { enqueuePositions, getQueue, getSyncStatus, clearSession, loadSession, saveSession, updateSyncStatus } from "./src/storage";
import { styles } from "./src/styles";
import { locationToPosition } from "./src/trackingTask";
import type { SyncStatus, TrackingAlert, TrackingDevice } from "./src/types";

const EMPTY_STATUS: SyncStatus = {
  lastPosition: null,
  lastSyncAt: null,
  route: null,
  error: null,
  authInvalid: false,
};

export default function App() {
  return <SafeAreaProvider><TrackerApp /></SafeAreaProvider>;
}

function TrackerApp() {
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [code, setCode] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [device, setDevice] = useState<TrackingDevice | null>(null);
  const [tracking, setTracking] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(EMPTY_STATUS);
  const [activeAlert, setActiveAlert] = useState<TrackingAlert | null>(null);
  const [alertMessage, setAlertMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const refreshLocalState = useCallback(async () => {
    const [queue, status, started] = await Promise.all([
      getQueue(),
      getSyncStatus(),
      Location.hasStartedLocationUpdatesAsync(TRACKING_TASK_NAME).catch(() => false),
    ]);
    setQueueCount(queue.length);
    setSyncStatus(status);
    setTracking(started);
  }, []);

  const refreshAlerts = useCallback(async (server: string, sessionToken: string) => {
    try {
      const result = await getMyAlerts(server, sessionToken);
      setActiveAlert(result.alerts[0] ?? null);
    } catch {
      // Le GPS et sa file locale restent prioritaires si le réseau est absent.
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function restore() {
      const deepLink = await Linking.getInitialURL();
      const restored = await loadSession();
      if (!active) return;
      const link = parseConnectionLink(deepLink ?? null);
      setApiUrl(link.server || restored.apiUrl || DEFAULT_API_URL);
      setCode(link.code || "");
      if (restored.token && restored.device && restored.apiUrl) {
        setToken(restored.token);
        setDevice(restored.device);
        try {
          const current = await getSession(restored.apiUrl, restored.token);
          if (!active) return;
          setDevice(current.device);
          await saveSession(restored.apiUrl, restored.token, current.device);
        } catch (restoreError) {
          if (restoreError instanceof ApiError && restoreError.status === 401) {
            await Location.stopLocationUpdatesAsync(TRACKING_TASK_NAME).catch(() => undefined);
            await clearSession();
            if (active) {
              setToken(null);
              setDevice(null);
              setError("Cette association a expiré. Entre un nouveau code coureur.");
            }
          } else if (active) {
            setNotice("Mode hors ligne : la session locale est conservée.");
          }
        }
      }
      await refreshLocalState();
      if (active) setBooting(false);
    }
    void restore();
    const linkSubscription = Linking.addEventListener("url", ({ url }) => {
      const link = parseConnectionLink(url);
      if (link.server) setApiUrl(link.server);
      if (link.code) setCode(link.code);
    });
    return () => {
      active = false;
      linkSubscription.remove();
    };
  }, [refreshLocalState]);

  useEffect(() => {
    if (!device || !token) return;
    const timer = setInterval(() => {
      void refreshLocalState();
      void refreshAlerts(apiUrl, token);
    }, 5_000);
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refreshLocalState();
        void flushPositionQueue().then(() => refreshLocalState());
      }
    });
    const initialAlerts = setTimeout(() => void refreshAlerts(apiUrl, token), 0);
    return () => {
      clearTimeout(initialAlerts);
      clearInterval(timer);
      appStateSubscription.remove();
    };
  }, [apiUrl, device, refreshAlerts, refreshLocalState, token]);

  async function connect() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const server = normalizeApiUrl(apiUrl);
      const result = await connectDevice(server, code.trim().toUpperCase());
      await clearSession();
      await saveSession(server, result.token, result.device);
      setApiUrl(server);
      setToken(result.token);
      setDevice(result.device);
      setCode("");
      setSyncStatus(EMPTY_STATUS);
      setQueueCount(0);
      setNotice("Téléphone associé. Démarre le GPS au moment du départ.");
    } catch (connectError) {
      setError(messageFromError(connectError, "Connexion impossible."));
    } finally {
      setBusy(false);
    }
  }

  async function startTracking() {
    if (!device || !token) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const foreground = await Location.requestForegroundPermissionsAsync();
      if (foreground.status !== "granted") throw new Error("Autorise la localisation précise pour démarrer le suivi.");

      const accepted = await confirm(
        "Localisation en arrière-plan",
        "Last Loop doit accéder à ta position lorsque l’écran est verrouillé. Le suivi ne fonctionne que pendant la course et tu peux l’arrêter ici à tout moment.",
        "CONTINUER",
      );
      if (!accepted) return;
      const background = await Location.requestBackgroundPermissionsAsync();
      if (background.status !== "granted") {
        throw new Error("Autorise la localisation « Toujours » dans les réglages pour suivre la course écran verrouillé.");
      }

      await Location.startLocationUpdatesAsync(TRACKING_TASK_NAME, {
        accuracy: Location.Accuracy.High,
        activityType: Location.ActivityType.Fitness,
        timeInterval: 10_000,
        distanceInterval: 10,
        deferredUpdatesInterval: 15_000,
        deferredUpdatesDistance: 20,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: `Last Loop · #${device.bib}`,
          notificationBody: "Suivi GPS actif pendant la course",
          notificationColor: "#ff5b24",
          killServiceOnDestroy: false,
        },
      });

      const firstLocation = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const firstPosition = locationToPosition(firstLocation);
      if (firstPosition) {
        await enqueuePositions([firstPosition]);
        await updateSyncStatus({ lastPosition: firstPosition, error: null, authInvalid: false });
      }
      await flushPositionQueue();
      await refreshLocalState();
      setNotice("GPS actif. Tu peux verrouiller l’écran.");
    } catch (trackingError) {
      setError(messageFromError(trackingError, "Impossible de démarrer le GPS."));
    } finally {
      setBusy(false);
    }
  }

  async function stopTracking() {
    setBusy(true);
    setError("");
    try {
      await Location.stopLocationUpdatesAsync(TRACKING_TASK_NAME);
      await flushPositionQueue();
      await refreshLocalState();
      setNotice("Suivi GPS arrêté. Les derniers points ont été synchronisés.");
    } catch (trackingError) {
      setError(messageFromError(trackingError, "Impossible d’arrêter le suivi."));
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true);
    setError("");
    const result = await flushPositionQueue();
    await refreshLocalState();
    setNotice(result.remaining
      ? `${result.remaining} point${result.remaining > 1 ? "s" : ""} conservé${result.remaining > 1 ? "s" : ""} hors ligne.`
      : "Toutes les positions sont synchronisées.");
    setBusy(false);
  }

  function requestAlert(kind: "assistance" | "urgent") {
    if (!token || !device) return;
    Alert.alert(
      kind === "urgent" ? "Alerte urgente" : "Besoin d’assistance",
      kind === "urgent"
        ? "Prévenir immédiatement la direction avec ta dernière position connue ? En cas de danger vital, appelle le 112."
        : "Prévenir la direction de course avec ta dernière position connue ?",
      [
        { text: "ANNULER", style: "cancel" },
        {
          text: "ENVOYER",
          style: kind === "urgent" ? "destructive" : "default",
          onPress: () => void sendAlert(kind),
        },
      ],
    );
  }

  async function sendAlert(kind: "assistance" | "urgent") {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      await flushPositionQueue();
      const result = await sendTrackingAlert(apiUrl, token, kind, alertMessage.trim());
      setActiveAlert(result.alert);
      setAlertMessage("");
      setNotice(kind === "urgent" ? "Alerte urgente transmise." : "Demande d’assistance transmise.");
    } catch (alertError) {
      setError(messageFromError(alertError, "Alerte non envoyée."));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!token) return;
    const accepted = await confirm(
      "Dissocier ce téléphone ?",
      "Le suivi sera arrêté et les éventuelles positions non envoyées seront supprimées.",
      "DISSOCIER",
      true,
    );
    if (!accepted) return;
    setBusy(true);
    await Location.stopLocationUpdatesAsync(TRACKING_TASK_NAME).catch(() => undefined);
    await disconnectDevice(apiUrl, token).catch(() => undefined);
    await clearSession();
    setToken(null);
    setDevice(null);
    setTracking(false);
    setQueueCount(0);
    setSyncStatus(EMPTY_STATUS);
    setActiveAlert(null);
    setNotice("");
    setError("");
    setBusy(false);
  }

  if (booting) {
    return (
      <SafeAreaView style={styles.loadingPage}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.brandMark}>⌁</Text>
        <ActivityIndicator size="large" color="#ff5b24" />
        <Text style={styles.loadingText}>PRÉPARATION DE LA BALISE…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.brandRow}><Text style={styles.brandMark}>⌁</Text><Text style={styles.brand}>LAST LOOP</Text></View>
            <View style={[styles.statusPill, tracking && styles.statusPillLive]}>
              <View style={[styles.statusDot, tracking && styles.statusDotLive]} />
              <Text style={styles.statusPillText}>{tracking ? "GPS ACTIF" : "GPS EN PAUSE"}</Text>
            </View>
          </View>

          {!device || !token ? (
            <>
              <Text style={styles.eyebrow}>BALISE GPS · APPLICATION MOBILE</Text>
              <Text style={styles.title}>Ta course.{"\n"}Même écran verrouillé.</Text>
              <Text style={styles.lead}>Associe ce téléphone avec le code donné par la direction. Les positions seront gardées hors ligne puis envoyées automatiquement.</Text>

              <View style={styles.card}>
                <Text style={styles.step}>01</Text>
                <Text style={styles.cardTitle}>Associer l’appareil</Text>
                <Text style={styles.label}>ADRESSE DU SERVEUR</Text>
                <TextInput
                  style={styles.input}
                  value={apiUrl}
                  onChangeText={setApiUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  placeholder="https://course.example.fr"
                  placeholderTextColor="#716b61"
                />
                <Text style={styles.hint}>Sur un téléphone physique en développement : IP locale du PC, par exemple http://192.168.1.20:3000.</Text>
                <Text style={styles.label}>CODE COUREUR</Text>
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  value={code}
                  onChangeText={(value) => setCode(value.toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder="27-ABCD2345"
                  placeholderTextColor="#716b61"
                />
                <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, busy && styles.disabled]} disabled={busy || !code.trim() || !apiUrl.trim()} onPress={() => void connect()}>
                  {busy ? <ActivityIndicator color="#11100e" /> : <Text style={styles.primaryButtonText}>ASSOCIER CE TÉLÉPHONE →</Text>}
                </Pressable>
                <View style={styles.consentBox}>
                  <Text style={styles.consentTitle}>CONSENTEMENT</Text>
                  <Text style={styles.consentText}>En démarrant le suivi, tu acceptes le partage de ta position avec l’organisation et sur le suivi public de la course. Tu peux l’arrêter à tout moment.</Text>
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={styles.runnerCard}>
                <View style={styles.bibBox}><Text style={styles.bib}>#{device.bib}</Text></View>
                <View style={styles.runnerIdentity}>
                  <Text style={styles.eyebrow}>{device.eventName.toUpperCase()}</Text>
                  <Text style={styles.runnerName}>{device.runnerName}</Text>
                  <Text style={styles.expiry}>Associé jusqu’au {formatDate(device.expiresAt)}</Text>
                </View>
              </View>

              <View style={[styles.card, tracking && styles.liveCard]}>
                <View style={styles.liveHeading}>
                  <View style={[styles.bigPulse, tracking && styles.bigPulseLive]} />
                  <View><Text style={styles.eyebrow}>ÉTAT DE LA BALISE</Text><Text style={styles.cardTitle}>{tracking ? "La position est suivie." : "Prête pour le départ."}</Text></View>
                </View>

                <View style={styles.metrics}>
                  <Metric label="PRÉCISION" value={syncStatus.lastPosition ? `± ${Math.round(syncStatus.lastPosition.accuracy)} m` : "—"} />
                  <Metric label="DERNIER POINT" value={formatTime(syncStatus.lastPosition?.recordedAt)} />
                  <Metric label="DERNIER ENVOI" value={formatTime(syncStatus.lastSyncAt)} />
                  <Metric label="EN ATTENTE" value={`${queueCount} point${queueCount > 1 ? "s" : ""}`} warning={queueCount > 30} />
                </View>

                {syncStatus.route && (
                  <View style={[styles.routeBox, syncStatus.route.offRoute && styles.routeBoxWarning]}>
                    <Text style={styles.routeTitle}>{syncStatus.route.offRoute ? "⚠ ÉCART DU PARCOURS" : "✓ SUR LE TRACÉ"}</Text>
                    <Text style={styles.routeText}>{syncStatus.route.distanceM} m du parcours enregistré</Text>
                  </View>
                )}

                {error ? <Message text={error} error /> : null}
                {syncStatus.error && syncStatus.error !== error ? <Message text={syncStatus.error} error={syncStatus.authInvalid} /> : null}
                {notice ? <Message text={notice} /> : null}

                {!tracking ? (
                  <Pressable style={({ pressed }) => [styles.primaryButton, styles.startButton, pressed && styles.pressed, busy && styles.disabled]} disabled={busy} onPress={() => void startTracking()}>
                    {busy ? <ActivityIndicator color="#11100e" /> : <Text style={styles.primaryButtonText}>● DÉMARRER LE SUIVI GPS</Text>}
                  </Pressable>
                ) : (
                  <Pressable style={({ pressed }) => [styles.stopButton, pressed && styles.pressed, busy && styles.disabled]} disabled={busy} onPress={() => void stopTracking()}>
                    <Text style={styles.stopButtonText}>METTRE LE GPS EN PAUSE</Text>
                  </Pressable>
                )}
                <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} onPress={() => void syncNow()} disabled={busy}>
                  <Text style={styles.secondaryButtonText}>SYNCHRONISER MAINTENANT</Text>
                </Pressable>
              </View>

              <View style={styles.card}>
                <Text style={styles.eyebrow}>ASSISTANCE COURSE</Text>
                <Text style={styles.cardTitle}>Un problème sur la boucle ?</Text>
                {activeAlert && (
                  <View style={[styles.alertState, activeAlert.kind === "urgent" && styles.alertStateUrgent]}>
                    <Text style={styles.alertStateTitle}>{activeAlert.kind === "urgent" ? "ALERTE URGENTE" : "DEMANDE D’AIDE"}</Text>
                    <Text style={styles.alertStateText}>{alertStatus(activeAlert.status)}</Text>
                  </View>
                )}
                <TextInput
                  style={[styles.input, styles.messageInput]}
                  value={alertMessage}
                  onChangeText={setAlertMessage}
                  maxLength={240}
                  multiline
                  placeholder="Précision facultative : douleur, besoin d’eau…"
                  placeholderTextColor="#716b61"
                />
                <View style={styles.alertActions}>
                  <Pressable style={({ pressed }) => [styles.helpButton, pressed && styles.pressed]} disabled={busy} onPress={() => requestAlert("assistance")}><Text style={styles.helpButtonText}>BESOIN D’AIDE</Text></Pressable>
                  <Pressable style={({ pressed }) => [styles.urgentButton, pressed && styles.pressed]} disabled={busy} onPress={() => requestAlert("urgent")}><Text style={styles.urgentButtonText}>URGENCE</Text></Pressable>
                </View>
                <Text style={styles.emergencyNote}>Cette alerte prévient l’organisation. En cas de danger immédiat, appelle le 112.</Text>
              </View>

              <View style={styles.tipCard}>
                <Text style={styles.tipTitle}>POUR TENIR TOUTE LA COURSE</Text>
                <Text style={styles.tipText}>Charge le téléphone à 100 %, désactive le mode économie d’énergie et prévois une batterie externe. Ne force pas la fermeture de l’application.</Text>
              </View>

              <Pressable style={styles.disconnectButton} onPress={() => void disconnect()} disabled={busy}>
                <Text style={styles.disconnectText}>Dissocier ce téléphone</Text>
              </Pressable>
            </>
          )}

          {!device && error ? <Message text={error} error /> : null}
          {!device && notice ? <Message text={notice} /> : null}
          <Text style={styles.footer}>LAST LOOP TRACKER · DONNÉES GPS TEMPORAIRES</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Metric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, warning && styles.warningText]}>{value}</Text></View>;
}

function Message({ text, error = false }: { text: string; error?: boolean }) {
  return <View style={[styles.message, error && styles.messageError]}><Text style={[styles.messageText, error && styles.messageErrorText]}>{text}</Text></View>;
}

function parseConnectionLink(value: string | null) {
  if (!value) return { code: "", server: "" };
  try {
    const url = new URL(value);
    if (url.protocol !== "lastloop:") return { code: "", server: "" };
    return {
      code: (url.searchParams.get("code") || "").toUpperCase(),
      server: url.searchParams.get("server") || "",
    };
  } catch {
    return { code: "", server: "" };
  }
}

function messageFromError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatTime(value: number | null | undefined) {
  return value ? new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value) : "—";
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(value);
}

function alertStatus(status: TrackingAlert["status"]) {
  if (status === "acknowledged") return "Vue par la direction · prise en charge en cours";
  if (status === "resolved") return "Clôturée par la direction";
  return "Envoyée · en attente de prise en charge";
}

function confirm(title: string, message: string, confirmText: string, destructive = false) {
  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: "ANNULER", style: "cancel", onPress: () => resolve(false) },
      { text: confirmText, style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
