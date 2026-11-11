export type GpxPoint = {
  lat: number;
  lon: number;
  ele: number | null;
};

export type DashboardRunner = {
  id: number;
  rank: number;
  name: string;
  bib: number;
  country: string;
  laps: number;
  distanceKm: number;
  lastLapSeconds: number | null;
  bestLapSeconds: number | null;
  lastFinishedAt: number | null;
  state: "course" | "arrive" | "abandon";
  profileSlug: string | null;
  avatarEmoji: string | null;
  livePosition: {
    latitude: number;
    longitude: number;
    accuracyM: number;
    speedMps: number | null;
    headingDeg: number | null;
    recordedAt: number;
  } | null;
};

export type RaceUpdate = {
  id: number;
  type: string;
  title: string;
  detail: string;
  createdAt: number;
};

export type DashboardEvent = {
  id: number;
  name: string;
  location: string;
  startAt: number;
  loopDistanceKm: number;
  totalLoops: number | null;
  status: "draft" | "live" | "finished";
  gpxName: string;
  routePoints: GpxPoint[];
  routeDistanceKm: number;
  elevationGainM: number;
  minElevationM: number | null;
  maxElevationM: number | null;
  stats: {
    completedLaps: number;
    currentLap: number;
    activeRunners: number;
    totalRunners: number;
    distanceKm: number;
    nextDepartureAt: number;
  };
  runners: DashboardRunner[];
  updates: RaceUpdate[];
};

export type EventSummary = {
  id: number;
  name: string;
  location: string;
  startAt: number;
  status: string;
  isActive: boolean;
};

export type UserRole = "runner" | "admin" | "director";
export type AccountStatus = "pending" | "invited" | "active" | "disabled";

export type AuthUser = {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  participantId: number | null;
  accountStatus: AccountStatus;
};

export type RunnerProfileFields = {
  avatarEmoji: string;
  city: string;
  club: string;
  ageCategory: string;
  bio: string;
  backyardGoal: string;
  favoriteSnack: string;
  mantra: string;
  funFact: string;
  isPublic: boolean;
};

export type RunnerPublicProfile = RunnerProfileFields & {
  slug: string;
  name: string;
  bib: number;
  country: string;
  status: "active" | "out" | "dns";
  eventName: string;
  eventLocation: string;
  eventStartAt: number;
  loopDistanceKm: number;
  totalLoops: number | null;
  laps: Array<{
    lapNumber: number;
    startedAt: number;
    finishedAt: number;
    durationSeconds: number;
  }>;
};
