import { AsyncLocalStorage } from "async_hooks";
import { NextFunction, Request, Response } from "express";

// Per-request values that deep service code may need (audit log): client IP and request id.
type TRequestContext = { ip?: string; requestId?: string; userId?: string; role?: string };

const storage = new AsyncLocalStorage<TRequestContext>();

export const requestContext = (req: Request, _res: Response, next: NextFunction) => {
  storage.run({ ip: req.ip, requestId: typeof req.id === "string" ? req.id : String(req.id ?? "") }, next);
};

export const getRequestContext = (): TRequestContext => storage.getStore() ?? {};

// called by checkAuth once the user is known, so the audit log can name the actor
export const setContextUser = (userId: string, role: string) => {
  const store = storage.getStore();
  if (store) Object.assign(store, { userId, role });
};
