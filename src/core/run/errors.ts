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
