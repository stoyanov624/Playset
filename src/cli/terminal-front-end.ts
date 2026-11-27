import type { ArtistCandidate, MatchOutcome, Miss, Performance } from "../core/index.js";
import type { IncompleteStatus } from "../core/performances/index.js";
import type { NotAdded, Preview, RunFrontEnd } from "../core/run/index.js";
import type { CliIo } from "./main.js";

/** Writes one line (or a blank line) to standard output. */
export type WriteLine = (line?: string) => void;

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The run's questions and reports, asked and printed in the terminal. */
export function createTerminalFrontEnd(io: CliIo, out: WriteLine): RunFrontEnd {
  let loginShown = false;

  return {
    chooseArtist(candidates) {
      return io.prompts.select<ArtistCandidate>({
        message: "Which Artist do you mean?",
        choices: candidates.map((candidate) => ({ name: candidateLabel(candidate), value: candidate })),
      });
    },

    askTape(tape) {
      const by = tape.originalArtist ? ` (${tape.originalArtist})` : "";
      return io.prompts.confirm({ message: `Add the Tape "${tape.title}"${by} to the playlist?`, default: false });
    },

    askUseCompleteSetlist({ latest, complete }) {
      return io.prompts.confirm({
        message:
          `The latest Setlist (${latest.date}, ${latest.city}) looks incomplete. ` +
          `Use the newest complete one (${complete.date}, ${complete.city}) instead?`,
        default: false,
      });
    },

    async confirmCreate() {
      out();
      return io.prompts.confirm({ message: "Create this playlist?", default: false });
    },

    async showAuthorizeUrl(url) {
      loginShown = true;
      try {
        await io.openBrowser(url);
      } catch {
        // The URL is printed below, so a browser that can't be opened is not an error.
      }
      out();
      out("Log in to Spotify in your browser. If it did not open, open this link:");
      out(url);
      out("Waiting for the Spotify login (Ctrl-C to cancel)...");
    },

    showShow({ show, performanceCount, tapeCount, incompleteStatus }) {
      out();
      out(`${show.artist} – ${show.date} – ${show.venue}, ${show.city}`);
      out(show.url);
      out(`${plural(performanceCount, "Performance")}, ${plural(tapeCount, "Tape")}`);
      if (incompleteStatus.isIncomplete) {
        out(incompleteWarning(incompleteStatus));
        out("The Setlist Playlist may not be the full Show.");
      }
      out();
    },

    showProgress({ n, total, performance }) {
      if (n === 1) {
        if (loginShown) out("Logged in to Spotify.");
        out();
      }
      out(`Finding Matches ${n}/${total}: ${performance.title}`);
    },

    showPreview(preview) {
      printPreview(preview, out);
    },
  };
}

function candidateLabel(candidate: ArtistCandidate): string {
  return candidate.disambiguation ? `${candidate.name} (${candidate.disambiguation})` : candidate.name;
}

function printPreview(preview: Preview, out: WriteLine): void {
  out();
  let setLabel: string | undefined;
  for (const { number, performance, outcome } of preview.rows) {
    if (performance.setLabel !== setLabel) {
      setLabel = performance.setLabel;
      out(setLabel);
    }
    out(`${String(number).padStart(4)}. ${performance.title}${markersOf(performance)}`);
    out(`      → ${outcomeText(outcome)}`);
  }

  if (preview.notAdded.length > 0) {
    out();
    out("Not added:");
    for (const entry of preview.notAdded) out(`  ${notAddedLine(entry)}`);
  }

  out();
  if (preview.incompleteStatus.isIncomplete) out(incompleteWarning(preview.incompleteStatus));
  out(`Playlist: ${preview.playlistName} (${preview.public ? "public" : "private"})`);
  out(`${plural(preview.trackCount, "track")}, ${plural(preview.missCount, "Miss", "Misses")}`);

  if (preview.duplicates.length > 0) {
    out();
    out(`Warning: you already have ${preview.duplicates.length === 1 ? "a playlist" : "playlists"} with this name:`);
    for (const duplicate of preview.duplicates) out(`  ${duplicate.name}  ${duplicate.shareUrl}`);
    out("A new playlist will be created anyway.");
  }
}

function notAddedLine(entry: NotAdded): string {
  if (entry.reason !== "unknown") return `${entry.name} (${entry.reason === "tape" ? "Tape, left out" : "snippet"})`;
  const where = entry.after === 0 ? "at the start" : `after #${entry.after}`;
  return `(Unknown song) ${where}${entry.info === undefined ? "" : ` — ${entry.info}`}`;
}

/** `Warning: this Setlist looks incomplete: <n Unknown Songs>; note: "<Setlist note>".` */
export function incompleteWarning(status: IncompleteStatus): string {
  const reasons = [
    ...(status.unknownSongCount > 0 ? [plural(status.unknownSongCount, "Unknown Song")] : []),
    ...(status.setlistNote !== undefined ? [`note: "${status.setlistNote}"`] : []),
  ];
  return `Warning: this Setlist looks incomplete: ${reasons.join("; ")}.`;
}

/** The summary's Note line for an Incomplete Setlist, saying why it counts as incomplete. */
export const INCOMPLETE_NOTE = "Note: this Setlist is incomplete — the playlist may not be the full Show.";

function markersOf(performance: Performance): string {
  const markers = [
    ...(performance.isTape ? ["Tape"] : []),
    ...(performance.medley !== undefined ? ["Medley"] : []),
    ...(performance.originalArtist ? [`Cover of ${performance.originalArtist}`] : []),
  ];
  return markers.length > 0 ? ` [${markers.join(", ")}]` : "";
}

function outcomeText(outcome: MatchOutcome): string {
  if (outcome.kind === "miss") return "Miss";
  return `${outcome.name} — ${outcome.artists.join(", ")} · ${outcome.album}${outcome.live ? " (live)" : ""}`;
}

/** `<title> — <Artist>`, with ` (Cover of <Original Artist>)` for a Cover. */
export function missLine(miss: Miss): string {
  return `  ${miss.title} — ${miss.artist}${miss.originalArtist ? ` (Cover of ${miss.originalArtist})` : ""}`;
}
