import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = { requestId: string; userId?: number };

const storage = new AsyncLocalStorage<RequestContext>();

// Everything that runs inside `fn`, including code after any `await`, can read this context
export const runWithContext = <T>(context: RequestContext, fn: () => T): T =>
  storage.run(context, fn);

export const getContext = (): RequestContext | undefined => storage.getStore();

// The store is a plain object, so authentication can add the user once it is known
export function setContextUser(userId: number): void {
  const context = storage.getStore();
  if (context) context.userId = userId;
}
