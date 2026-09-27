import type { z } from "zod";
import type { Env } from "./env";

export interface RequestContext {
  request: Request;
  env: Env;
  url: URL;
  /** Capture groups from the route pattern. */
  params: string[];
  ctx: ExecutionContext;
}

export type Handler = (context: RequestContext) => Promise<Response>;

/** Thrown by handlers to answer with a JSON error. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

const MAX_BODY_BYTES = 16 * 1024;

/** Parses and validates a JSON body. Anything malformed is a 400. */
export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, "too_large", "Request is too large.");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, "bad_request", "Request body must be JSON.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HttpError(400, "bad_request", "Request was not understood.");
  return parsed.data;
}

/**
 * Cookie-authenticated requests that change something must come from our own pages. Browsers
 * always send Origin on these, so a missing or foreign one means another site is trying.
 */
export function requireSameOrigin({ request, url }: RequestContext): void {
  if (request.headers.get("Origin") !== url.origin) {
    throw new HttpError(403, "bad_origin", "Request came from another site.");
  }
}

export function isSameOrigin(request: Request, url: URL): boolean {
  return request.headers.get("Origin") === url.origin;
}
