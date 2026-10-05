// Short-lived cache for public, read-heavy lists (plan.md 12.4): the doctor list and the
// specialties. Kept in memory (one API instance). Every change that affects these lists calls
// invalidatePublicCatalog(), so 60 s is only the upper bound for staleness, e.g. for ratings.
// With several API instances, back `store` with Redis (same get / set / clear interface).
import type { RequestHandler } from "express";

export const PUBLIC_CACHE_SECONDS = 60;
const MAX_ENTRIES = 500;

type TEntry = { expiresAt: number; value: unknown };
const store = new Map<string, TEntry>();

// Returns the cached value for `key`, or loads, caches and returns it.
// Concurrent misses share one load (no stampede on a cold cache).
const inflight = new Map<string, Promise<unknown>>();
export const cached = async <T>(key: string, load: () => Promise<T>, ttlSeconds = PUBLIC_CACHE_SECONDS): Promise<T> => {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = load()
    .then((value) => {
      if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value as string); // oldest first
      store.set(key, { expiresAt: Date.now() + ttlSeconds * 1000, value });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
};

// stable cache key for a query string object (same filters in another order = same key)
export const queryKey = (prefix: string, query: object) =>
  `${prefix}:${JSON.stringify(Object.entries(query).sort(([a], [b]) => a.localeCompare(b)))}`;

// doctors, ratings, availability or specialties changed
export const invalidatePublicCatalog = () => {
  for (const key of store.keys()) {
    if (key.startsWith("doctors:") || key.startsWith("specialties:")) store.delete(key);
  }
};

export const clearResponseCache = () => store.clear();

// Cache-Control for public GET lists, so browsers / a CDN in front of the API can reuse them too
export const publicCacheHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", `public, max-age=${PUBLIC_CACHE_SECONDS}, stale-while-revalidate=${PUBLIC_CACHE_SECONDS * 5}`);
  next();
};

// Any successful write that can change the public doctor list or the specialties clears them:
// doctor create / edit / delete / availability, specialty changes, reviews (ratings),
// account status changes (blocked doctors are hidden) and profile edits (name, photo).
const CATALOG_WRITE_PATHS = ["/doctors", "/specialties", "/reviews", "/users/create-doctor", "/admins/change-user-status", "/profile/me"];
export const invalidateCatalogOnWrite: RequestHandler = (req, res, next) => {
  if (req.method !== "GET" && CATALOG_WRITE_PATHS.some((p) => req.path === p || req.path.startsWith(`${p}/`))) {
    res.on("finish", () => {
      if (res.statusCode < 400) invalidatePublicCatalog();
    });
  }
  next();
};
