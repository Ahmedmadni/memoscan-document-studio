<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- All scanning, image processing (src/lib/imaging.ts), storage (IndexedDB, src/lib/db.ts) and PDF export (jsPDF, src/lib/pdf.ts) run in the browser — documents must never be uploaded; no backend/auth/paid services.
- UI strings live in src/lib/i18n.tsx (Arabic default, RTL); add both languages for every new string.
- Keep dependencies browser-only for future Capacitor packaging; native needs are tracked in docs/ANDROID.md.
- tsconfig has noUncheckedIndexedAccess off because the pixel loops index typed arrays heavily.
- Signature geometry and PDF export share browser-safe helpers in src/lib/signature.ts using normalized visible crop-box coordinates, including page rotation, so preview and export agree.
- PDF.js rendering lives in a dynamically imported browser-only module with a Vite-emitted matching worker and abort cleanup, so SSR does not evaluate browser rendering code.
