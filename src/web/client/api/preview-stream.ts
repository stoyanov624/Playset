// Reads the preview stream's event lines from the answer body. The browser's EventSource can't
// be used: it can't read the plain JSON error answers sent before a stream starts.
import type { z } from "zod";
import {
  PREVIEW_EVENTS,
  previewErrorSchema,
  previewProgressSchema,
  previewResultSchema,
  type PreviewProgress,
  type PreviewResult,
} from "../../shared/index.js";
import { ApiCallError, driftedAnswerError, stoppedEarlyError } from "./errors.js";

interface StreamEvent {
  name: string;
  data: string;
}

/** One event block (the lines between blank lines); comment-only and empty blocks give nothing. */
function parseBlock(block: string): StreamEvent | null {
  let name = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line === "" || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") name = value;
    if (field === "data") data.push(value);
  }
  return data.length === 0 ? null : { name, data: data.join("\n") };
}

function parseData<T>(data: string, schema: z.ZodType<T>): T {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    throw driftedAnswerError();
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw driftedAnswerError();
  return parsed.data;
}

/**
 * Hands each progress event to `onProgress` and resolves with the preview event's data; an error
 * event fails with that error. A body that closes first is a stream that stopped early.
 */
export async function readPreviewStream(
  body: ReadableStream<Uint8Array>,
  onProgress: (progress: PreviewProgress) => void,
): Promise<PreviewResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) throw stoppedEarlyError();
      // "\r\n" is joined across chunks because the whole buffer is normalised each time.
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
      for (let end = buffer.indexOf("\n\n"); end !== -1; end = buffer.indexOf("\n\n")) {
        const event = parseBlock(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (event === null) continue;
        if (event.name === PREVIEW_EVENTS.progress) onProgress(parseData(event.data, previewProgressSchema));
        if (event.name === PREVIEW_EVENTS.preview) return parseData(event.data, previewResultSchema);
        if (event.name === PREVIEW_EVENTS.error) throw new ApiCallError(parseData(event.data, previewErrorSchema));
      }
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
}
