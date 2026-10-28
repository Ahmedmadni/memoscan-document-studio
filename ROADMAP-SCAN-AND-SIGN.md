# Waraqah Product Roadmap — Scan + Sign

## Product direction

Waraqah (ورقة) is one privacy-first document workspace with two equally visible workflows:
1. **Scan documents** — capture/import images, correct pages, organize them and export image-based PDFs.
2. **Sign PDFs** — open an existing PDF or a PDF created by the scanner, create/reuse a visual signature, place it on any page, and export a signed copy.

The workflows share one document library, common file import/export, local-first storage, bilingual Arabic/English UI, privacy controls and a single design system. Do not create a second app or duplicate the document library.

## UX and navigation

- Home screen presents two clear primary actions: **Scan document** and **Sign a PDF**.
- A unified **My documents** library shows scanned projects and imported PDF files with type labels, last-updated time, page count where available, rename, duplicate/export and delete actions.
- Scanning and signing are independent workflows. Scanned documents stay in the shared library and are never automatically sent to signing.
- Offer an explicit **Sign this PDF** action only when the user chooses it for a scanned/exported document; the user may also sign a separately imported PDF without scanning anything.
- A document opened from Sign PDF can be signed and exported as a new file; preserve the original by default.
- Arabic-first RTL and English LTR layouts; support narrow Android screens, keyboard navigation, accessible labels and visible progress/error states.
- Keep the existing package ID com.ahmedelmadni.memoscan so the rebrand does not break install identity.

## Signing MVP

- Import a PDF using the system file picker or choose a PDF exported from Waraqah.
- Preview PDF pages and navigate between pages.
- Create a visual signature by drawing with touch/stylus/mouse on a high-resolution canvas; also offer typed-name signature as an optional convenience, clearly distinguished from hand-drawn signing.
- Import an existing signature image from the device photo gallery/image picker (PNG with transparency preferred; JPEG supported). Preview and crop/trim transparent margins where feasible, preserve aspect ratio, and let the user confirm before placing it.
- Preview, clear and recreate signatures; import a signature image from the photo library; retain reusable signatures only after explicit opt-in. Provide a clear way to remove a saved signature.
- Place, move, resize and remove signature overlays on a selected page; support undo before export.
- Export a new PDF with the signature embedded at the intended page coordinates, preserving page dimensions and orientation. Keep the source PDF unchanged.
- Confirm export, provide a filename, and use the same download/share flow as scan exports.
- Handle password-protected, malformed, very large and unsupported PDFs with clear errors rather than crashing.
- Keep all PDF processing local on-device; do not upload document contents or signatures.

## Technical approach

- Preserve the existing scanner image-processing and IndexedDB document storage.
- Introduce a small PDF signing service isolated from UI components. Evaluate and add a maintained PDF manipulation library (for example, pdf-lib) with its lockfile updated and dependency/license reviewed.
- Use a PDF renderer/viewer suitable for Capacitor/WebView for preview and coordinate mapping. Keep PDF points, rendered CSS pixels and device-pixel ratio conversions explicit and tested.
- Model signature placements by document ID, page index, normalized x/y position, width/height and rotation. Normalize coordinates to page bounds so placement remains correct across screen sizes.
- Store a draft signature project and original file locally; export to a new PDF blob. Do not overwrite originals silently.
- Use a shared document record abstraction with explicit type/state metadata; migrate existing IndexedDB data non-destructively and preserve all existing scanner records.
- Keep signature capture canvas separate from PDF rendering and never save an accidental transparent/blank signature as valid.
- Review library licenses and bundle size before selecting dependencies; ensure Android offline operation after install.

## Security, trust and legal wording

- The MVP embeds a **visual signature image** into a PDF. It is not a certificate-backed cryptographic digital signature, does not independently verify signer identity, and must not be marketed as providing those guarantees.
- Explain this distinction in the UI/help/privacy copy. A future advanced phase may explore certificate-based PDF signatures, identity verification, audit trails and timestamping after legal and security review.
- Ask before storing reusable signatures; allow deleting them. An image selected from the photo library is used only after explicit user selection and confirmation; do not scan the photo library in the background. Avoid analytics or logging containing document names, file contents or signature pixels.
- Warn that a signature placed on a document may have legal consequences and encourage review before final export.

## Delivery phases and acceptance criteria

### Phase 0 — Stabilize current release
- Fix the launcher-icon workflow and formatting/lint failures.
- Verify tests, lint, web build, Android APK creation, manifest icon references and the generated APK artifact.
- Do not call an APK release-ready until all CI steps pass; real Android camera verification remains a device-level check.

### Phase 1 — Shared product shell and library
- Update branding and metadata across home/document/privacy pages.
- Add Scan / Sign entry points without removing current scanner capabilities.
- Establish shared document types and safe local storage migration.
- Acceptance: existing scanner documents remain accessible; scan and sign can be started independently; scanned documents are not automatically routed to signing; both entry points work in Arabic and English; no duplicate libraries.

### Phase 2 — Signature capture and placement
- Implement draw/clear/recreate signature canvas with touch, stylus and mouse support.
- Add PDF import, viewer/page navigation, placement overlay, drag/resize, undo and page-boundary constraints.
- Acceptance: placement stays aligned after zoom/rotation and on small/large screens; blank signatures cannot be exported; an image chosen from the gallery can be previewed, rejected, or placed without forcing a scan workflow.

### Phase 3 — PDF export and shared handoff
- Embed the visual signature into a copy of the original PDF, preserving all pages, page sizes and orientation.
- Add filename, progress, save/share, and direct handoff from scanned documents.
- Acceptance: original file is unchanged; exported PDF opens in independent readers; signature appears on the intended page and location; multi-page PDFs retain every page.

### Phase 4 — Quality, privacy and accessibility
- Add unit tests for coordinate mapping, placement bounds, file validation and storage migration; integration tests for multi-page export.
- Test Arabic/English, RTL/LTR, offline behavior, cancellation, low-memory and large PDFs.
- Review keyboard/screen-reader labels, color contrast, permission prompts, privacy copy and deletion of stored signatures.
- Acceptance: CI passes and a documented physical Android smoke test covers camera, import, signing, export and share.

### Phase 5 — Optional advanced signing
- Only after the MVP is stable, assess certificate-based cryptographic signatures, trusted identity, timestamps and audit records. This is a separate security/legal scope, not implied by the visual-signature MVP.

## Release checklist
- [ ] Current CI is green (tests + lint + web build + Android debug APK).
- [ ] Native launcher icon is verified inside the generated APK.
- [ ] Scan workflow and existing local documents are regression-tested.
- [ ] Import PDF → sign → export → reopen works on Android.
- [ ] Original PDF remains unchanged.
- [ ] Arabic and English workflows and all error states are reviewed.
- [ ] Privacy wording clearly distinguishes visual signatures from cryptographic digital signatures.
- [ ] Real-device camera and file-share checks are recorded before calling the app production-ready.