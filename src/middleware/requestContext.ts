import type { RequestHandler } from "express";
import { runWithContext } from "../requestContext.js";

// Must run AFTER express.json(): the body parser calls next() from a stream event, and
// a listener runs in the context of whoever emits, so a context created earlier would be lost.
export const requestContext: RequestHandler = (_req, res, next) => {
  const { requestId } = res.locals as { requestId: string };
  runWithContext({ requestId }, () => next());
};
