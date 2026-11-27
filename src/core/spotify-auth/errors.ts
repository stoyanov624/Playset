// Typed errors for the Spotify login. Messages and hints never contain tokens, codes or verifiers (AC-28).
import { PlaysetError } from "../http/index.js";

export class MissingClientIdError extends PlaysetError {
  declare readonly hint: string;
  constructor(configFile: string, redirectUri: string) {
    super("Spotify client id not found.", {
      hint:
        `Set SPOTIFY_CLIENT_ID, or add {"spotifyClientId": "<your id>"} to ${configFile}.\n` +
        `In your Spotify app settings, register the redirect URI ${redirectUri}`,
    });
  }
}

export class InvalidPortError extends PlaysetError {
  constructor(readonly value: string) {
    super(`PLAYSET_AUTH_PORT must be a whole number from 1 to 65535, got "${value}".`);
  }
}

export class StateMismatchError extends PlaysetError {
  constructor() {
    super("The Spotify login callback did not carry the expected state. Please try logging in again.");
  }
}

export class AuthorizationError extends PlaysetError {}

export class AccessDeniedError extends AuthorizationError {
  constructor() {
    super("The Spotify login was declined.");
  }
}

export class TokenError extends PlaysetError {
  /** Spotify's `error` code from the token endpoint, when it sent one. */
  readonly spotifyError: string | undefined;
  constructor(message: string, spotifyError?: string, options: { cause?: unknown } = {}) {
    super(message, options);
    this.spotifyError = spotifyError;
  }
}

export class RateLimitError extends PlaysetError {
  constructor(attempts: number, options: { cause?: unknown } = {}) {
    super(`Spotify kept rate-limiting the token request (${attempts} attempts). Please try again later.`, options);
  }
}

export class PortInUseError extends PlaysetError {
  declare readonly hint: string;
  constructor(readonly port: number) {
    super(`Port ${port} on 127.0.0.1 is already in use, so the Spotify login callback can't be received.`, {
      hint: "Set PLAYSET_AUTH_PORT to a free port and register the matching redirect URI in your Spotify app settings.",
    });
  }
}
