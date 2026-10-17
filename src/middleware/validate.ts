import type { RequestHandler } from "express";
import type { ZodType } from "zod";

type Schemas = { params?: ZodType; query?: ZodType; body?: ZodType };

export function validate(schemas: Schemas): RequestHandler {
  return (req, res, next) => {
    if (schemas.params) res.locals.params = schemas.params.parse(req.params);
    if (schemas.query) res.locals.query = schemas.query.parse(req.query);
    if (schemas.body) res.locals.body = schemas.body.parse(req.body);
    next();
  };
}