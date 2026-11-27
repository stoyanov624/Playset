// Compile-time checks of the inferred types (example X11). `npm run typecheck` enforces them;
// at run time the expectTypeOf calls are no-ops.
import { describe, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import type {
  AdminCallbackQuery,
  AdminLogoutBody,
  AdminPageQuery,
  AdminStatusResponse,
  ApiError,
  ArtistCandidate,
  ArtistSetlistsParams,
  ArtistSetlistsQuery,
  ArtistSetlistsResponse,
  ArtistsQuery,
  ArtistsResponse,
  ConfigItem,
  CreatePlaylistBody,
  CreatePlaylistResponse,
  ErrorBody,
  ErrorCode,
  IncompleteStatus,
  Match,
  Mbid,
  Miss,
  NotAdded,
  PlaylistStatus,
  PreviewError,
  PreviewEventName,
  PreviewMiss,
  PreviewPerformance,
  PreviewProgress,
  PreviewResult,
  PreviewRow,
  SetlistId,
  SetlistLinksQuery,
  SetlistLinksResponse,
  SetlistParams,
  SetlistResponse,
  SetlistSummary,
  Show,
  VersionId,
} from "../../../src/web/shared/index.js";
import {
  CONFIG_ITEMS,
  ERROR_CODES,
  PREVIEW_EVENTS,
  adminCallbackQuerySchema,
  adminLogoutBodySchema,
  adminPageQuerySchema,
  adminStatusResponseSchema,
  apiErrorSchema,
  artistCandidateSchema,
  artistSetlistsParamsSchema,
  artistSetlistsQuerySchema,
  artistSetlistsResponseSchema,
  artistsQuerySchema,
  artistsResponseSchema,
  createPlaylistBodySchema,
  createPlaylistResponseSchema,
  errorBodySchema,
  incompleteStatusSchema,
  matchSchema,
  mbidSchema,
  missSchema,
  notAddedSchema,
  playlistStatusSchema,
  previewErrorSchema,
  previewMissSchema,
  previewPerformanceSchema,
  previewProgressSchema,
  previewResultSchema,
  previewRowSchema,
  setlistIdSchema,
  setlistLinksQuerySchema,
  setlistLinksResponseSchema,
  setlistParamsSchema,
  setlistResponseSchema,
  setlistSummarySchema,
  showSchema,
  versionIdSchema,
} from "../../../src/web/shared/index.js";

type AllCodes =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "PLAYLISTS_UNAVAILABLE"
  | "SETLIST_CHANGED"
  | "NOT_ADMIN"
  | "INTERNAL";

describe("inferred types", () => {
  it("AC-25: ErrorCode, PreviewEventName and ConfigItem are exactly their string unions", () => {
    expectTypeOf<ErrorCode>().toEqualTypeOf<AllCodes>();
    expectTypeOf<(typeof ERROR_CODES)[number]>().toEqualTypeOf<AllCodes>();
    expectTypeOf<ApiError["code"]>().toEqualTypeOf<ErrorCode>();
    expectTypeOf<PreviewEventName>().toEqualTypeOf<"progress" | "preview" | "error">();
    expectTypeOf<(typeof PREVIEW_EVENTS)[keyof typeof PREVIEW_EVENTS]>().toEqualTypeOf<PreviewEventName>();
    expectTypeOf<ConfigItem>().toEqualTypeOf<"setlist.fm API key" | "Spotify client id" | "Host Account id" | "Cookie secret">();
    expectTypeOf<(typeof CONFIG_ITEMS)[number]>().toEqualTypeOf<ConfigItem>();
    expectTypeOf<AdminStatusResponse["config"][number]["name"]>().toEqualTypeOf<ConfigItem>();
    expectTypeOf<AdminPageQuery["login"]>().toEqualTypeOf<ErrorCode | undefined>();
  });

  it("AC-25: a preview row's outcome is Match | Miss and narrows on kind", () => {
    expectTypeOf<PreviewRow["outcome"]>().toEqualTypeOf<Match | Miss>();
    expectTypeOf<Match["kind"]>().toEqualTypeOf<"match">();
    expectTypeOf<Miss["kind"]>().toEqualTypeOf<"miss">();
    const narrow = (outcome: PreviewRow["outcome"]) => {
      if (outcome.kind === "match") expectTypeOf(outcome).toEqualTypeOf<Match>();
      else expectTypeOf(outcome).toEqualTypeOf<Miss>();
    };
    expectTypeOf(narrow).toBeFunction();
    expectTypeOf<PreviewResult["rows"]>().toEqualTypeOf<PreviewRow[]>();
    expectTypeOf<PreviewResult["misses"]>().toEqualTypeOf<PreviewMiss[]>();
    expectTypeOf<PreviewResult["notAdded"]>().toEqualTypeOf<NotAdded[]>();
    expectTypeOf<PreviewRow["performance"]>().toEqualTypeOf<PreviewPerformance>();
  });

  it("AC-25: an Unknown Song in the not-added list has after and an optional info, and no name", () => {
    type UnknownSong = Extract<NotAdded, { reason: "unknown" }>;
    expectTypeOf<UnknownSong["after"]>().toEqualTypeOf<number>();
    expectTypeOf<UnknownSong>().not.toHaveProperty("name");
    expectTypeOf<{ reason: "unknown"; after: number }>().toExtend<UnknownSong>();
    expectTypeOf<{ reason: "unknown"; after: number; info: string }>().toExtend<UnknownSong>();
    expectTypeOf<Exclude<UnknownSong["info"], undefined>>().toEqualTypeOf<string>();
    expectTypeOf<Exclude<NotAdded, { reason: "unknown" }>["name"]>().toEqualTypeOf<string>();
    expectTypeOf<NotAdded["reason"]>().toEqualTypeOf<"snippet" | "tape" | "unknown">();
  });

  it("AC-25: PlaylistStatus none has no url; current and outdated have url: string", () => {
    expectTypeOf<Extract<PlaylistStatus, { status: "none" }>>().not.toHaveProperty("url");
    expectTypeOf<Extract<PlaylistStatus, { status: "current" }>["url"]>().toEqualTypeOf<string>();
    expectTypeOf<Extract<PlaylistStatus, { status: "outdated" }>["url"]>().toEqualTypeOf<string>();
    expectTypeOf<PlaylistStatus["status"]>().toEqualTypeOf<"none" | "current" | "outdated">();
    expectTypeOf<SetlistResponse["playlist"]>().toEqualTypeOf<PlaylistStatus>();
  });

  it("AC-25: parsed requests: page is a number, the create body is { versionId: string }", () => {
    expectTypeOf<ArtistSetlistsQuery["page"]>().toEqualTypeOf<number>();
    expectTypeOf<CreatePlaylistBody>().toEqualTypeOf<{ versionId: string }>();
    expectTypeOf<ArtistsQuery["name"]>().toEqualTypeOf<string>();
    expectTypeOf<SetlistParams["id"]>().toEqualTypeOf<string>();
    expectTypeOf<ArtistSetlistsParams["mbid"]>().toEqualTypeOf<string>();
    expectTypeOf<SetlistLinksQuery["url"]>().toEqualTypeOf<string>();
  });

  it("AC-25: the create answer's status is created | updated", () => {
    expectTypeOf<CreatePlaylistResponse["status"]>().toEqualTypeOf<"created" | "updated">();
    expectTypeOf<CreatePlaylistResponse["url"]>().toEqualTypeOf<string>();
  });

  it("AC-25: dropped core fields are absent from the types", () => {
    expectTypeOf<ArtistCandidate>().not.toHaveProperty("autoPick");
    expectTypeOf<ArtistsResponse>().not.toHaveProperty("autoPick");
    expectTypeOf<Exclude<ArtistCandidate["disambiguation"], undefined>>().toEqualTypeOf<string>();
    expectTypeOf<{ name: string; mbid: string }>().toExtend<ArtistCandidate>();
    expectTypeOf<Match>().not.toHaveProperty("uri");
    expectTypeOf<Match>().not.toHaveProperty("id");
    expectTypeOf<Miss>().not.toHaveProperty("queries");
    expectTypeOf<PreviewMiss>().not.toHaveProperty("kind");
    expectTypeOf<PreviewPerformance>().not.toHaveProperty("isTape");
    expectTypeOf<PreviewPerformance>().not.toHaveProperty("artist");
    expectTypeOf<PreviewResult>().not.toHaveProperty("matches");
    expectTypeOf<SetlistSummary>().not.toHaveProperty("versionId");
    expectTypeOf<Show>().not.toHaveProperty("country");
    expectTypeOf<AdminStatusResponse["hostAccount"]>().not.toHaveProperty("id");
    expectTypeOf<AdminStatusResponse["config"][number]>().not.toHaveProperty("value");
  });

  it("AC-25: each exported type is the parsed type of its schema", () => {
    expectTypeOf<SetlistId>().toEqualTypeOf<z.output<typeof setlistIdSchema>>();
    expectTypeOf<Mbid>().toEqualTypeOf<z.output<typeof mbidSchema>>();
    expectTypeOf<VersionId>().toEqualTypeOf<z.output<typeof versionIdSchema>>();
    expectTypeOf<IncompleteStatus>().toEqualTypeOf<z.output<typeof incompleteStatusSchema>>();
    expectTypeOf<Show>().toEqualTypeOf<z.output<typeof showSchema>>();
    expectTypeOf<ArtistCandidate>().toEqualTypeOf<z.output<typeof artistCandidateSchema>>();
    expectTypeOf<SetlistSummary>().toEqualTypeOf<z.output<typeof setlistSummarySchema>>();
    expectTypeOf<PreviewPerformance>().toEqualTypeOf<z.output<typeof previewPerformanceSchema>>();
    expectTypeOf<Match>().toEqualTypeOf<z.output<typeof matchSchema>>();
    expectTypeOf<Miss>().toEqualTypeOf<z.output<typeof missSchema>>();
    expectTypeOf<PreviewRow>().toEqualTypeOf<z.output<typeof previewRowSchema>>();
    expectTypeOf<PreviewMiss>().toEqualTypeOf<z.output<typeof previewMissSchema>>();
    expectTypeOf<NotAdded>().toEqualTypeOf<z.output<typeof notAddedSchema>>();
    expectTypeOf<PlaylistStatus>().toEqualTypeOf<z.output<typeof playlistStatusSchema>>();
    expectTypeOf<ApiError>().toEqualTypeOf<z.output<typeof apiErrorSchema>>();
    expectTypeOf<ErrorBody>().toEqualTypeOf<z.output<typeof errorBodySchema>>();
    expectTypeOf<ArtistsQuery>().toEqualTypeOf<z.output<typeof artistsQuerySchema>>();
    expectTypeOf<ArtistSetlistsParams>().toEqualTypeOf<z.output<typeof artistSetlistsParamsSchema>>();
    expectTypeOf<ArtistSetlistsQuery>().toEqualTypeOf<z.output<typeof artistSetlistsQuerySchema>>();
    expectTypeOf<SetlistLinksQuery>().toEqualTypeOf<z.output<typeof setlistLinksQuerySchema>>();
    expectTypeOf<SetlistParams>().toEqualTypeOf<z.output<typeof setlistParamsSchema>>();
    expectTypeOf<CreatePlaylistBody>().toEqualTypeOf<z.output<typeof createPlaylistBodySchema>>();
    expectTypeOf<AdminCallbackQuery>().toEqualTypeOf<z.output<typeof adminCallbackQuerySchema>>();
    expectTypeOf<AdminPageQuery>().toEqualTypeOf<z.output<typeof adminPageQuerySchema>>();
    expectTypeOf<AdminLogoutBody>().toEqualTypeOf<z.output<typeof adminLogoutBodySchema>>();
    expectTypeOf<ArtistsResponse>().toEqualTypeOf<z.output<typeof artistsResponseSchema>>();
    expectTypeOf<ArtistSetlistsResponse>().toEqualTypeOf<z.output<typeof artistSetlistsResponseSchema>>();
    expectTypeOf<SetlistLinksResponse>().toEqualTypeOf<z.output<typeof setlistLinksResponseSchema>>();
    expectTypeOf<SetlistResponse>().toEqualTypeOf<z.output<typeof setlistResponseSchema>>();
    expectTypeOf<CreatePlaylistResponse>().toEqualTypeOf<z.output<typeof createPlaylistResponseSchema>>();
    expectTypeOf<AdminStatusResponse>().toEqualTypeOf<z.output<typeof adminStatusResponseSchema>>();
    expectTypeOf<PreviewProgress>().toEqualTypeOf<z.output<typeof previewProgressSchema>>();
    expectTypeOf<PreviewResult>().toEqualTypeOf<z.output<typeof previewResultSchema>>();
    expectTypeOf<PreviewError>().toEqualTypeOf<z.output<typeof previewErrorSchema>>();
  });
});
