// Typed errors for the Spotify login. Messages and hints never contain tokens, codes or verifiers (AC-28).

export class MissingClientIdError extends Error {
  override name = "MissingClientIdError";
  readonly hint: string;
  constructor(configFile: string, redirectUri: string) {
    super("Spotify client id not found.");
    this.hint =
      `Set SPOTIFY_CLIENT_ID, or add {"spotifyClientId": "<your id>"} to ${configFile}.\n` +
      `In your Spotify app settings, register the redirect URI ${redirectUri}`;
  }
}

export class InvalidPortError extends Error {
  override name = "InvalidPortError";
  constructor(readonly value: string) {
    super(`PLAYSET_AUTH_PORT must be a whole number from 1 to 65535, got "${value}".`);
  }
}

export class StateMismatchError extends Error {
  override name = "StateMismatchError";
  constructor() {
    super("The Spotify login callback did not carry the expected state. Please try logging in again.");
  }
}

export class AuthorizationError extends Error {
  override name = "AuthorizationError";
}

export class AccessDeniedError extends AuthorizationError {
  override name = "AccessDeniedError";
  constructor() {
    super("The Spotify login was declined.");
  }
}

export class TokenError extends Error {
  override name = "TokenError";
  /** Spotify's `error` code from the token endpoint, when it sent one. */
  readonly spotifyError: string | undefined;
  constructor(message: string, spotifyError?: string) {
    super(message);
    this.spotifyError = spotifyError;
  }
}

export class RateLimitError extends Error {
  override name = "RateLimitError";
  constructor(attempts: number) {
    super(`Spotify kept rate-limiting the token request (${attempts} attempts). Please try again later.`);
  }
}

export class PortInUseError extends Error {
  override name = "PortInUseError";
  readonly hint = "Set PLAYSET_AUTH_PORT to a free port and register the matching redirect URI in your Spotify app settings.";
  constructor(readonly port: number) {
    super(`Port ${port} on 127.0.0.1 is already in use, so the Spotify login callback can't be received.`);
  }
}
