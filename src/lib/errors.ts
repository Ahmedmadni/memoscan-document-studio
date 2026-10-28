import type { TKey } from "./i18n";

export function errorKey(e: unknown): TKey {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "UNSUPPORTED_IMAGE") return "errImage";
  if (msg === "NO_INDEXEDDB") return "errStorage";
  return "errGeneric";
}
