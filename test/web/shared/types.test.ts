// Compile-time checks of the inferred types (example X11). `npm run typecheck` enforces them;
// at run time the expectTypeOf calls are no-ops, so the run-time expects below check the values.
import { describe, expect, expectTypeOf, it } from "vitest";
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
import { madridPreview } from "./fixtures/contract-values";

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
    // Reading a field only one side has compiles only after narrowing on kind.
    const outcomeLine = (outcome: PreviewRow["outcome"]): string => {
      if (outcome.kind === "match") {
        expectTypeOf(outcome).toEqualTypeOf<Match>();
        return `${outcome.name} (${outcome.album})`;
      }
      expectTypeOf(outcome).toEqualTypeOf<Miss>();
      return `Miss: ${outcome.title} by ${outcome.artist}`;
    };
    const rows = previewResultSchema.parse(madridPreview()).rows;
    expect(rows.map((row) => outcomeLine(row.outcome))).toEqual([
      "Brianstorm (Favourite Worst Nightmare)",
      "Do I Wanna Know? (AM)",
      "R U Mine? (AM)",
      "Brianstorm (Favourite Worst Nightmare)",
      "Miss: 505 by Arctic Monkeys",
    ]);
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

  it("AC-25: each exported type has exactly the agreed shape, field by field", () => {
    expectTypeOf<SetlistId>().toEqualTypeOf<string>();
    expectTypeOf<Mbid>().toEqualTypeOf<string>();
    expectTypeOf<VersionId>().toEqualTypeOf<string>();
    expectTypeOf<IncompleteStatus>().toEqualTypeOf<{
      isIncomplete: boolean;
      unknownSongCount: number;
      matchedPhrase?: string | undefined;
      setlistNote?: string | undefined;
    }>();
    expectTypeOf<Show>().toEqualTypeOf<{ artist: string; date: string; venue: string; city: string; url: string }>();
    expectTypeOf<ArtistCandidate>().toEqualTypeOf<{ name: string; mbid: string; disambiguation?: string | undefined }>();
    expectTypeOf<SetlistSummary>().toEqualTypeOf<{
      id: string;
      date: string;
      venue: string;
      city: string;
      songCount: number;
      incompleteStatus: IncompleteStatus;
    }>();
    expectTypeOf<PreviewPerformance>().toEqualTypeOf<{
      position: number;
      title: string;
      setLabel: string;
      originalArtist?: string | undefined;
      medley?: string | undefined;
    }>();
    expectTypeOf<Match>().toEqualTypeOf<{ kind: "match"; name: string; artists: string[]; album: string; live: boolean }>();
    expectTypeOf<Miss>().toEqualTypeOf<{ kind: "miss"; title: string; artist: string; originalArtist?: string | undefined }>();
    expectTypeOf<PreviewRow>().toEqualTypeOf<{ number: number; performance: PreviewPerformance; outcome: Match | Miss }>();
    expectTypeOf<PreviewMiss>().toEqualTypeOf<{ number: number; title: string; artist: string; originalArtist?: string | undefined }>();
    expectTypeOf<NotAdded>().toEqualTypeOf<
      { reason: "snippet" | "tape"; name: string } | { reason: "unknown"; after: number; info?: string | undefined }
    >();
    expectTypeOf<PlaylistStatus>().toEqualTypeOf<
      { status: "none" } | { status: "current"; url: string } | { status: "outdated"; url: string }
    >();
    expectTypeOf<ApiError>().toEqualTypeOf<{ code: ErrorCode; message: string; hint?: string | undefined }>();
    expectTypeOf<ErrorBody>().toEqualTypeOf<{ error: ApiError }>();
    expectTypeOf<PreviewError>().toEqualTypeOf<ApiError>();
    expectTypeOf<ArtistsQuery>().toEqualTypeOf<{ name: string }>();
    expectTypeOf<ArtistSetlistsParams>().toEqualTypeOf<{ mbid: string }>();
    expectTypeOf<ArtistSetlistsQuery>().toEqualTypeOf<{ page: number }>();
    expectTypeOf<SetlistLinksQuery>().toEqualTypeOf<{ url: string }>();
    expectTypeOf<SetlistParams>().toEqualTypeOf<{ id: string }>();
    expectTypeOf<AdminPageQuery>().toEqualTypeOf<{ login?: ErrorCode | undefined }>();
    expectTypeOf<ArtistsResponse>().toEqualTypeOf<{ artists: ArtistCandidate[] }>();
    expectTypeOf<ArtistSetlistsResponse>().toEqualTypeOf<{
      artist: { mbid: string; name?: string | undefined };
      setlists: SetlistSummary[];
      hasMore: boolean;
    }>();
    expectTypeOf<SetlistLinksResponse>().toEqualTypeOf<{ setlistId: string }>();
    expectTypeOf<SetlistResponse>().toEqualTypeOf<{ show: Show; incompleteStatus: IncompleteStatus; playlist: PlaylistStatus }>();
    expectTypeOf<CreatePlaylistResponse>().toEqualTypeOf<{ url: string; status: "created" | "updated" }>();
    expectTypeOf<PreviewProgress>().toEqualTypeOf<{ n: number; total: number }>();
    expectTypeOf<PreviewResult>().toEqualTypeOf<{
      show: Show;
      incompleteStatus: IncompleteStatus;
      rows: PreviewRow[];
      misses: PreviewMiss[];
      notAdded: NotAdded[];
      playlistName: string;
      versionId: string;
    }>();
    expectTypeOf<AdminStatusResponse>().toEqualTypeOf<{
      hostAccount: { connected: boolean; displayName?: string | undefined };
      config: Array<{ name: ConfigItem; present: boolean }>;
      usage: {
        playlistsMade: number;
        opens: number;
        perDay: Array<{ date: string; created: number; updated: number; opened: number }>;
        topArtists: Array<{ artist: string; playlistCount: number }>;
      };
      rateLimitHitsToday: number;
    }>();
  });

  it("AC-25: the admin callback query is a code or an error, never both", () => {
    expectTypeOf<{ code: string; state: string }>().toExtend<AdminCallbackQuery>();
    expectTypeOf<{ error: string; state: string }>().toExtend<AdminCallbackQuery>();
    expectTypeOf<{ code: string; error: string; state: string }>().not.toExtend<AdminCallbackQuery>();
    expectTypeOf<{ state: string }>().not.toExtend<AdminCallbackQuery>();
    expectTypeOf<AdminCallbackQuery["state"]>().toEqualTypeOf<string>();
  });

  it("AC-25: the logout body is absent or an empty object", () => {
    expectTypeOf<undefined>().toExtend<AdminLogoutBody>();
    expectTypeOf<{}>().toExtend<AdminLogoutBody>();
    expectTypeOf<{ all: true }>().not.toExtend<AdminLogoutBody>();
  });

  it("AC-25: every schema parses to its exported type (so the schemas carry the agreed shapes too)", () => {
    const parsed = previewResultSchema.parse(madridPreview());
    expectTypeOf(parsed).toEqualTypeOf<PreviewResult>();
    expectTypeOf(setlistIdSchema.parse).returns.toEqualTypeOf<SetlistId>();
    expectTypeOf(mbidSchema.parse).returns.toEqualTypeOf<Mbid>();
    expectTypeOf(versionIdSchema.parse).returns.toEqualTypeOf<VersionId>();
    expectTypeOf(incompleteStatusSchema.parse).returns.toEqualTypeOf<IncompleteStatus>();
    expectTypeOf(showSchema.parse).returns.toEqualTypeOf<Show>();
    expectTypeOf(artistCandidateSchema.parse).returns.toEqualTypeOf<ArtistCandidate>();
    expectTypeOf(setlistSummarySchema.parse).returns.toEqualTypeOf<SetlistSummary>();
    expectTypeOf(previewPerformanceSchema.parse).returns.toEqualTypeOf<PreviewPerformance>();
    expectTypeOf(matchSchema.parse).returns.toEqualTypeOf<Match>();
    expectTypeOf(missSchema.parse).returns.toEqualTypeOf<Miss>();
    expectTypeOf(previewRowSchema.parse).returns.toEqualTypeOf<PreviewRow>();
    expectTypeOf(previewMissSchema.parse).returns.toEqualTypeOf<PreviewMiss>();
    expectTypeOf(notAddedSchema.parse).returns.toEqualTypeOf<NotAdded>();
    expectTypeOf(playlistStatusSchema.parse).returns.toEqualTypeOf<PlaylistStatus>();
    expectTypeOf(apiErrorSchema.parse).returns.toEqualTypeOf<ApiError>();
    expectTypeOf(errorBodySchema.parse).returns.toEqualTypeOf<ErrorBody>();
    expectTypeOf(previewErrorSchema.parse).returns.toEqualTypeOf<PreviewError>();
    expectTypeOf(artistsQuerySchema.parse).returns.toEqualTypeOf<ArtistsQuery>();
    expectTypeOf(artistSetlistsParamsSchema.parse).returns.toEqualTypeOf<ArtistSetlistsParams>();
    expectTypeOf(artistSetlistsQuerySchema.parse).returns.toEqualTypeOf<ArtistSetlistsQuery>();
    expectTypeOf(setlistLinksQuerySchema.parse).returns.toEqualTypeOf<SetlistLinksQuery>();
    expectTypeOf(setlistParamsSchema.parse).returns.toEqualTypeOf<SetlistParams>();
    expectTypeOf(createPlaylistBodySchema.parse).returns.toEqualTypeOf<CreatePlaylistBody>();
    expectTypeOf(adminCallbackQuerySchema.parse).returns.toEqualTypeOf<AdminCallbackQuery>();
    expectTypeOf(adminPageQuerySchema.parse).returns.toEqualTypeOf<AdminPageQuery>();
    expectTypeOf(adminLogoutBodySchema.parse).returns.toEqualTypeOf<AdminLogoutBody>();
    expectTypeOf(artistsResponseSchema.parse).returns.toEqualTypeOf<ArtistsResponse>();
    expectTypeOf(artistSetlistsResponseSchema.parse).returns.toEqualTypeOf<ArtistSetlistsResponse>();
    expectTypeOf(setlistLinksResponseSchema.parse).returns.toEqualTypeOf<SetlistLinksResponse>();
    expectTypeOf(setlistResponseSchema.parse).returns.toEqualTypeOf<SetlistResponse>();
    expectTypeOf(createPlaylistResponseSchema.parse).returns.toEqualTypeOf<CreatePlaylistResponse>();
    expectTypeOf(adminStatusResponseSchema.parse).returns.toEqualTypeOf<AdminStatusResponse>();
    expectTypeOf(previewProgressSchema.parse).returns.toEqualTypeOf<PreviewProgress>();
    expect(parsed.versionId).toBe("g3e5f7a91");
  });
});
