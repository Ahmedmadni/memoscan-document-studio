import type { TKey } from "./i18n";

export function errorKey(e: unknown): TKey {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "UNSUPPORTED_IMAGE") return "errImage";
  if (msg === "UNSUPPORTED_HEIC") return "errHeic";
  if (msg === "NO_INDEXEDDB") return "errStorage";
  if (msg === "STORAGE_BUSY") return "storageBusy";
  if (msg === "BACKUP_INVALID") return "backupInvalid";
  if (msg === "BACKUP_TOO_LARGE") return "backupTooLarge";
  if (msg === "BACKUP_INCOMPLETE") return "backupIncomplete";
  if (
    msg === "STORAGE_WRITE_FAILED" ||
    (e instanceof DOMException && e.name === "QuotaExceededError")
  )
    return "storageWriteFailed";
  return "errGeneric";
}
