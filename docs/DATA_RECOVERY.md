# Local recovery and backup

## Capture sessions

Camera captures, per-page edits and approvals are stored in IndexedDB as a draft. Closing the camera keeps the draft. Scan and each existing document use independent draft keys. Users can resume a saved session or explicitly discard it.

The save indicator reports commit completion. If storage fails, the session remains in memory with a retry action. Camera import removes successful files from the draft and retains failed files. A resumed new-document session reuses its destination document. A committed capture has a stable import key so retrying the same session does not duplicate that page. Manual page copies and document merges omit that key.

## Page deletion

Removing a page commits its new document order before starting the six-second undo window. Undo restores the page against the current order in a transaction that also checks that its image exists. Finalization checks the document reference before deleting the image, so an aborted write or a successful undo cannot erase a retained page. Document deletion, page import and document merging commit related records together.

## Complete document backups

Settings exports a `.waraqah` file containing original images, processed images, thumbnails, page order, document names/categories/notes, timestamps and editing settings. Capture drafts and the separate signature vault are explicitly excluded. The older JSON export is an index only and cannot restore images.

The binary format is versioned. Version 1 starts with the eight bytes `WARAQ1\r\n`, a four-byte little-endian manifest length, and 32 bytes of SHA-256 over the UTF-8 JSON manifest. Image blobs follow in manifest order, each with a declared MIME type, size and SHA-256. Both Web Crypto and the fallback compute actual SHA-256.

Restore validates the header, version, manifest, document/page references, asset boundaries and all checksums before any writable transaction. It adds copies with fresh IDs and commits documents and pages in one transaction. A damaged file or failed transaction leaves existing documents intact. Limits are 512 MB per archive, 100 MB per image asset, 1,000 documents and 1,000 pages. Backups are unencrypted local files; keep exported copies in a location you control. On Android, export uses the native share sheet.

## Storage migration

IndexedDB version 2 adds the drafts store and capture-import lookup index. Existing document/page records and the app ID are retained. An upgrade blocked by another open app window reports a retryable storage message.

## Verification

Automated regressions cover v1 migration, aborted deletion after request success, undo/finalization, complete backup round trips, damaged/truncated archives, atomic restore rollback, draft approval recovery, import retry and exact SHA-256 reference vectors. Physical Android checks remain required for lifecycle interruption, low storage, camera capabilities and native sharing.
