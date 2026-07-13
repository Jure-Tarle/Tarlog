/**
 * core.ts — single re-export of `@tarlog/core` (doc 05 §4).
 *
 * ALL business logic (time math, rounding, compliance, billing, zod schemas)
 * lives in the shared `@tarlog/core` package and is consumed unchanged by every
 * client. The mobile app NEVER reimplements a calculation; it imports from here
 * so there is exactly one dependency edge to audit.
 */
export * from "@tarlog/core";
