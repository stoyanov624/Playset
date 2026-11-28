// What every Visitor route shares within one app: the injected services and stores, the failure log, the
// Host token, Playset's refusals, usage events, and how a route reads its input and sends its answer.
import express, { type ErrorRequestHandler, type Request, type Response } from "express";
import type {
  HostPlaylistServices,
  RunServices,
  SetlistBrowsingServices,
  SetlistPlaylistRecords,
} from "../../../core/index.js";
import { CATALOGUE, VisitorError, type CatalogueEntry } from "../catalogue.js";
import type { WebConfig } from "../config.js";
import type { FailureLog } from "../logging.js";
import { checked, type Schema } from "../shapes.js";
import type { UsageEventKind, UsageEvents } from "../usage-events.js";

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
  /**
   * Records a usage event for today. Never fails: the Visitor's answer is unharmed by a usage event that
   * couldn't be saved (it only makes the numbers short by one), so that is logged instead.
   */
  recordUsage(kind: UsageEventKind, setlistId: string, artist: string): Promise<void>;
}

/** The input as the contract reads it, or the Visitor error `entry` when the contract rejects it. */
export function parsed<T>(schema: Schema<T>, value: unknown, entry: CatalogueEntry): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new VisitorError(entry);
  return result.data;
}

/** 10 kB: no body a Visitor or the admin sends needs more. */
const BODY_LIMIT_BYTES = 10 * 1024;

const jsonBody = express.json({ limit: BODY_LIMIT_BYTES });

/**
 * Reads a JSON body into `req.body` (left undefined when none is sent). A body too large, or not JSON, is
 * the sender's error (`invalid`), never logged.
 */
export function readJsonBody(req: Request, res: Response, invalid: CatalogueEntry): Promise<void> {
  return new Promise((resolve, reject) => {
    jsonBody(req, res, (error?: unknown) => {
      if (error === undefined) {
        resolve();
        return;
      }
      const tooLarge = (error as { type?: unknown }).type === "entity.too.large";
      reject(new VisitorError(tooLarge ? CATALOGUE.bodyTooLarge : invalid));
    });
  });
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
