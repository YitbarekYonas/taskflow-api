export class UserError extends Error {}
export class NotFoundError extends UserError {}
export class ConflictError extends UserError {}
export class InvalidReferenceError extends UserError {}

export class DuplicateError extends ConflictError {}
export class UnauthorizedError extends UserError {}
export class InUseError extends ConflictError {}