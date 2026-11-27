import { PlaysetError } from "../http/index.js";

/** The run's input cannot be used: it is blank, or mixes a setlist.fm link with other words. */
export class RunInputError extends PlaysetError {}

/** The run was cancelled through its signal before the create request was sent. */
export class RunCancelledError extends PlaysetError {
  constructor(message = "Cancelled.") {
    super(message);
  }
}

/** A page of an Artist's Setlists was asked for with a number setlist.fm cannot have. */
export class InvalidSetlistPageError extends PlaysetError {
  constructor(readonly page: number) {
    super(`Setlist page ${page} is not valid: give a whole number of 1 or more.`);
  }
}

/**
 * The Setlist was edited on setlist.fm after the preview, so creating now would not put in what the
 * Visitor saw.
 */
export class SetlistChangedError extends PlaysetError {
  constructor(
    readonly previewedVersionId: string,
    readonly currentVersionId: string,
  ) {
    super("This Setlist was changed on setlist.fm after the preview.", {
      hint: "Load a fresh preview, then create the Setlist Playlist again.",
    });
  }
}

/**
 * The Setlist has no setlist id or no setlist.fm version, so whether its Setlist Playlist still mirrors it
 * could never be told; the Host Account makes none for it.
 */
export class MissingSetlistVersionError extends PlaysetError {
  constructor(readonly setlistId: string) {
    super(`Setlist ${setlistId} has no setlist.fm version, so its Setlist Playlist can't be kept up to date.`);
  }
}
