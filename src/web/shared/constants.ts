// The fixed values both web halves agree on: route paths, error codes, preview event names,
// input limits and the labels of the admin status config list.

/** Route paths as templates; the client fills in `:mbid` and `:id` itself. */
export const ROUTES = {
  artists: "/api/artists",
  artistSetlists: "/api/artists/:mbid/setlists",
  setlistLinks: "/api/setlist-links",
  setlist: "/api/setlists/:id",
  setlistPreview: "/api/setlists/:id/preview",
  setlistPlaylist: "/api/setlists/:id/playlist",
  adminLogin: "/admin/login",
  adminCallback: "/admin/callback",
  adminStatus: "/api/admin/status",
  adminLogout: "/api/admin/logout",
} as const;

export const ERROR_CODES = [
  "INVALID_INPUT",
  "NOT_FOUND",
  "RATE_LIMITED",
  "UPSTREAM_UNAVAILABLE",
  "PLAYLISTS_UNAVAILABLE",
  "SETLIST_CHANGED",
  "NOT_ADMIN",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const PREVIEW_EVENTS = {
  progress: "progress",
  preview: "preview",
  error: "error",
} as const;

export type PreviewEventName = (typeof PREVIEW_EVENTS)[keyof typeof PREVIEW_EVENTS];

/** Bounds on what a visitor can send or ask for, chosen by Playset; not setlist.fm or Spotify limits. */
export const LIMITS = {
  artistNameMaxLength: 200,
  setlistLinkMaxLength: 2048,
  versionIdMaxLength: 64,
  pageMax: 1000,
  pageDefault: 1,
  topArtistsMax: 10,
  usageDays: 30,
} as const;

/**
 * Human-readable labels of the required config, so the admin status never carries an env
 * name or a value: the env names behind these labels stay on the server, which maps each
 * label to its own setting. Settings with defaults (rate limits, port, data file) are not listed.
 */
export const CONFIG_ITEMS = [
  "setlist.fm API key",
  "Spotify client id",
  "Host Account id",
  "Cookie secret",
] as const;

export type ConfigItem = (typeof CONFIG_ITEMS)[number];
