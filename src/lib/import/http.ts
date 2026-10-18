// Shared bits of the browser-side importers.
import type { ParsedGame } from "~/lib/types";

/** Error with a user-facing Spanish message. */
export class ImportError extends Error {}

export const RATE_LIMITED_MSG = "La plataforma nos pidió esperar un minuto";

export type ImportProgress = (p: { fetched: number; message?: string }) => void;

export type UserImportResult = {
  games: ParsedGame[];
  /** Variants / unparseable games skipped ("N no soportadas"). */
  unsupported: number;
  /** Set when we stopped early (429 twice) but kept what we already had. */
  warning?: string;
};

export const USERNAME_RE = /^[A-Za-z0-9_-]{1,50}$/;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch with the platform 429 policy (D6): tell the user, wait 60 s, retry once.
 * Returns null if still rate limited. Network errors become ImportError.
 */
export async function fetchWith429(
  url: string,
  init: RequestInit,
  onProgress: ImportProgress | undefined,
  fetched: number
): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch {
      throw new ImportError("No pudimos conectar con la plataforma. Revisa tu conexión.");
    }
    if (res.status !== 429) return res;
    if (attempt === 0) {
      onProgress?.({ fetched, message: RATE_LIMITED_MSG });
      await sleep(60_000);
    }
  }
  return null;
}

export const clampMax = (max: number) => Math.min(100, Math.max(1, Math.floor(max) || 20));
