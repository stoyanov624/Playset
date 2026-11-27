// PRD 0010 AC-17 — the Spotify search adapter sends "+" and "&" so that Spotify receives them as
// written (X10). A fake fetch records each request; no network.
import { describe, expect, it } from "vitest";
import { createSpotifyTrackSearch } from "../../src/core/matching";
import { payload } from "./fixtures/fake-track-search";

interface RecordedRequest {
  rawUrl: string;
  method: string;
}

/** A fake fetch that records the exact URL string it was given and answers 200 with no tracks. */
function recordingFetch() {
  const requests: RecordedRequest[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const rawUrl = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    requests.push({ rawUrl, method });
    return new Response(JSON.stringify(payload()), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return { fetch, requests };
}

const sleep = async () => {};
const TOKEN = "BQD-test-token";

/** The query parameters as Spotify decodes them (application/x-www-form-urlencoded: "+" means space). */
function decodedParams(rawUrl: string): [string, string][] {
  return [...new URL(rawUrl).searchParams.entries()];
}

describe("createSpotifyTrackSearch — '+' and '&' reach Spotify as written (PRD 0010)", () => {
  it("AC-17: X10 — `track:\"Love & Hate\" artist:\"Michael Kiwanuka\"` is received with exactly q, type=track and limit=10", async () => {
    const { fetch, requests } = recordingFetch();
    const search = createSpotifyTrackSearch({ accessToken: TOKEN, fetch, sleep });

    await search.searchTracks('track:"Love & Hate" artist:"Michael Kiwanuka"', 10);

    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe("GET");
    const url = new URL(requests[0]!.rawUrl);
    expect(`${url.origin}${url.pathname}`).toBe("https://api.spotify.com/v1/search");
    expect(decodedParams(requests[0]!.rawUrl).sort()).toEqual(
      [
        ["q", 'track:"Love & Hate" artist:"Michael Kiwanuka"'],
        ["type", "track"],
        ["limit", "10"],
      ].sort(),
    );
  });

  it("AC-17: X10 — `track:\"M+M's\" artist:\"blink-182\"` is received with the '+' unchanged, never as a space", async () => {
    const { fetch, requests } = recordingFetch();
    const search = createSpotifyTrackSearch({ accessToken: TOKEN, fetch, sleep });

    await search.searchTracks(`track:"M+M's" artist:"blink-182"`, 10);

    expect(new URL(requests[0]!.rawUrl).searchParams.get("q")).toBe(`track:"M+M's" artist:"blink-182"`);
    expect(requests[0]!.rawUrl).toContain("%2B");
  });

  it("AC-17: a spaced '+' in the plain-text retry is received unchanged", async () => {
    const { fetch, requests } = recordingFetch();
    const search = createSpotifyTrackSearch({ accessToken: TOKEN, fetch, sleep });

    await search.searchTracks("Love + Hate Michael Kiwanuka", 10);

    expect(new URL(requests[0]!.rawUrl).searchParams.get("q")).toBe("Love + Hate Michael Kiwanuka");
  });

  it("AC-17: a query with both '&' and '+' is received whole: one q value, nothing split off", async () => {
    const { fetch, requests } = recordingFetch();
    const search = createSpotifyTrackSearch({ accessToken: TOKEN, fetch, sleep });

    await search.searchTracks(`track:"A&B + C" artist:"Florence + the Machine"`, 10);

    const params = decodedParams(requests[0]!.rawUrl);
    expect(params.filter(([k]) => k === "q")).toEqual([["q", `track:"A&B + C" artist:"Florence + the Machine"`]]);
    expect(params.map(([k]) => k).sort()).toEqual(["limit", "q", "type"]);
  });
});
