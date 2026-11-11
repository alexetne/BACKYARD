import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { MAX_QUEUED_POSITIONS } from "./constants";
import type { QueuedPosition, SyncStatus, TrackingDevice } from "./types";

const KEYS = {
  token: "last_loop_native_token_v1",
  apiUrl: "last_loop_api_url_v1",
  device: "last_loop_device_v1",
  queue: "last_loop_gps_queue_v1",
  sync: "last_loop_sync_status_v1",
};

const EMPTY_SYNC_STATUS: SyncStatus = {
  lastPosition: null,
  lastSyncAt: null,
  route: null,
  error: null,
  authInvalid: false,
};

let queueOperation: Promise<unknown> = Promise.resolve();

export async function saveSession(apiUrl: string, token: string, device: TrackingDevice) {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.token, token),
    AsyncStorage.setItem(KEYS.apiUrl, apiUrl),
    AsyncStorage.setItem(KEYS.device, JSON.stringify(device)),
  ]);
}

export async function loadSession() {
  const [apiUrl, token, deviceValue] = await Promise.all([
    AsyncStorage.getItem(KEYS.apiUrl),
    SecureStore.getItemAsync(KEYS.token),
    AsyncStorage.getItem(KEYS.device),
  ]);
  return {
    apiUrl,
    token,
    device: parseJson<TrackingDevice>(deviceValue),
  };
}

export async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.token),
    AsyncStorage.multiRemove([KEYS.device, KEYS.queue, KEYS.sync]),
  ]);
}

export async function getQueue() {
  return parseQueue(await AsyncStorage.getItem(KEYS.queue));
}

export function enqueuePositions(positions: QueuedPosition[]) {
  return withQueueLock(async () => {
    const current = parseQueue(await AsyncStorage.getItem(KEYS.queue));
    const known = new Set(current.map(positionKey));
    const merged = [...current];
    for (const position of positions) {
      if (!known.has(positionKey(position))) merged.push(position);
    }
    const queue = merged.slice(-MAX_QUEUED_POSITIONS);
    await AsyncStorage.setItem(KEYS.queue, JSON.stringify(queue));
    return queue.length;
  });
}

export function removeQueuedPositions(sent: QueuedPosition[]) {
  return withQueueLock(async () => {
    const sentKeys = new Set(sent.map(positionKey));
    const current = parseQueue(await AsyncStorage.getItem(KEYS.queue));
    const remaining = current.filter((position) => !sentKeys.has(positionKey(position)));
    await AsyncStorage.setItem(KEYS.queue, JSON.stringify(remaining));
    return remaining.length;
  });
}

export async function getSyncStatus(): Promise<SyncStatus> {
  return parseJson<SyncStatus>(await AsyncStorage.getItem(KEYS.sync)) ?? EMPTY_SYNC_STATUS;
}

export async function updateSyncStatus(update: Partial<SyncStatus>) {
  const current = await getSyncStatus();
  const next = { ...current, ...update };
  await AsyncStorage.setItem(KEYS.sync, JSON.stringify(next));
  return next;
}

function withQueueLock<T>(operation: () => Promise<T>) {
  const next = queueOperation.then(operation, operation);
  queueOperation = next.then(() => undefined, () => undefined);
  return next;
}

function parseQueue(value: string | null): QueuedPosition[] {
  const parsed = parseJson<unknown[]>(value);
  return Array.isArray(parsed) ? parsed.filter(isQueuedPosition).slice(-MAX_QUEUED_POSITIONS) : [];
}

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function isQueuedPosition(value: unknown): value is QueuedPosition {
  if (!value || typeof value !== "object") return false;
  const position = value as Partial<QueuedPosition>;
  return Number.isFinite(position.latitude)
    && Number.isFinite(position.longitude)
    && Number.isFinite(position.accuracy)
    && Number.isFinite(position.recordedAt);
}

function positionKey(position: QueuedPosition) {
  return `${position.recordedAt}:${position.latitude}:${position.longitude}`;
}
