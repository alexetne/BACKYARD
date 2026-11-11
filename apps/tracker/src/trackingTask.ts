import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { TRACKING_TASK_NAME } from "./constants";
import { flushPositionQueue } from "./api";
import { enqueuePositions, updateSyncStatus } from "./storage";
import type { QueuedPosition } from "./types";

TaskManager.defineTask(TRACKING_TASK_NAME, async ({ data, error }) => {
  if (error) {
    await updateSyncStatus({ error: `GPS : ${error.message}` });
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations ?? [];
  const positions = locations.map(locationToPosition).filter((value): value is QueuedPosition => value !== null);
  if (!positions.length) return;
  await enqueuePositions(positions);
  await updateSyncStatus({ lastPosition: positions[positions.length - 1] ?? null, error: null });
  await flushPositionQueue();
});

export function locationToPosition(location: Location.LocationObject): QueuedPosition | null {
  const { coords } = location;
  if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude) || !Number.isFinite(coords.accuracy)) return null;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy ?? 0,
    altitude: finiteOrNull(coords.altitude),
    speed: finiteOrNull(coords.speed),
    heading: finiteOrNull(coords.heading),
    recordedAt: Math.round(location.timestamp || Date.now()),
  };
}

function finiteOrNull(value: number | null) {
  return value !== null && Number.isFinite(value) ? value : null;
}
