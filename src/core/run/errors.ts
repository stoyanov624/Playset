import { PlaysetError } from "../http/index.js";

/** The run's input cannot be used: it is blank, or mixes a setlist.fm link with other words. */
export class RunInputError extends PlaysetError {}

/** The run was cancelled through its signal before the create request was sent. */
export class RunCancelledError extends PlaysetError {
  constructor(message = "Cancelled.") {
    super(message);
  }
}
