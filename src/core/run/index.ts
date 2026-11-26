// Slice 7: the whole run from a setlist.fm link or Artist name to a Setlist Playlist (PRD 0007).
// Front-end agnostic: no terminal or Node-UI imports; every question and service is injected.
export { runPlayset } from "./run-playset.js";
export type {
  CreatedPlaylist,
  MatchProgress,
  NotAdded,
  PlaylistLink,
  Preview,
  PreviewRow,
  RunFrontEnd,
  RunOptions,
  RunOutcome,
  RunRequest,
  RunServices,
  ShowSummary,
} from "./types.js";
