// What every Visitor route shares within one app: the injected services and stores, the failure log, the
// Host token, Playset's refusals, and how a route reads its input and sends its answer.
import type { ErrorRequestHandler, Request, Response } from "express";
import type {
  HostPlaylistServices,
  RunServices,
  SetlistBrowsingServices,
  SetlistPlaylistRecords,
} from "../../../core/index.js";
import { VisitorError, type CatalogueEntry } from "../catalogue.js";
import type { WebConfig } from "../config.js";
import type { FailureLog } from "../logging.js";
import { checked, type Schema } from "../shapes.js";
import type { UsageEvents } from "../usage-events.js";

/** The core's setlist.fm and Spotify services, as `createRunServices` builds them. */
export type WebServices = RunServices & SetlistBrowsingServices & HostPlaylistServices;

export interface RouteContext {
  config: WebConfig;
  services: WebServices;
  records: SetlistPlaylistRecords;
  events: UsageEvents;
  /** Milliseconds since the epoch. */
  now: () => number;
  log: FailureLog;
  /** The Host token. @throws VisitorError PLAYLISTS_UNAVAILABLE when the Host Account is not connected. */
  hostToken(): Promise<string>;
  /** A Playset limit refused the request: counted for today, answered with how long to wait. */
  refuse(entry: CatalogueEntry, retryAfter: number): VisitorError;
}

/** The input as the contract reads it, or the Visitor error `entry` when the contract rejects it. */
export function parsed<T>(schema: Schema<T>, value: unknown, entry: CatalogueEntry): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new VisitorError(entry);
  return result.data;
}

/** Answers with `value` once the contract's response schema accepts it. */
export function sendJson<T>(res: Response, schema: Schema<T>, what: string, value: unknown): void {
  res.json(checked(schema, what, value));
}

/** The Visitor address: the connection's, or the one the trusted proxy forwarded (Express's `trust proxy`). */
export const addressOf = (req: Request): string => req.ip ?? req.socket.remoteAddress ?? "";

/**
 * A path parameter whose percent-encoding can't be decoded is the Visitor's bad input: Express rejects it
 * before any handler runs, so the router that owns the parameter answers it as its own rejected input.
 */
export function undecodableParamIs(entry: CatalogueEntry): ErrorRequestHandler {
  return (error: unknown, _req, _res, next) => {
    next(error instanceof URIError ? new VisitorError(entry) : error);
  };
}
