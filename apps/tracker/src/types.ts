export type ParticipantStatus = "active" | "out" | "dns";

export type TrackingDevice = {
  id: number;
  eventId: number;
  participantId: number;
  expiresAt: number;
  runnerName: string;
  bib: number;
  eventName: string;
  participantStatus: ParticipantStatus;
};

export type QueuedPosition = {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  recordedAt: number;
};

export type RouteStatus = {
  distanceM: number;
  thresholdM: number;
  offRoute: boolean;
};

export type SyncStatus = {
  lastPosition: QueuedPosition | null;
  lastSyncAt: number | null;
  route: RouteStatus | null;
  error: string | null;
  authInvalid: boolean;
};

export type TrackingAlert = {
  id: number;
  kind: "assistance" | "urgent";
  message: string;
  status: "open" | "acknowledged" | "resolved";
  created_at: number;
  acknowledged_at: number | null;
  resolved_at: number | null;
};
