# Waraqah Pro — ورقة (CamScanner & Financial Document Studio Edition)

Waraqah is a privacy-first document workspace for scanning paper documents, decoding Saudi ZATCA tax invoices, and signing/stamping PDF files, designed for Arabic-first mobile use with an English interface and Android packaging through Capacitor.

**Tagline:** From paper to a polished file — in seconds.  
**الشعار:** من الورق إلى ملف جاهز — في ثوانٍ.

## Key Capabilities (CamScanner Pro + Financial Edition)

1. **Smart Camera & Perspective Studio**:
   - Live edge detection, 3×3 alignment grid, portrait orientation lock on Android, and batch capture queue.
   - Precision Magnifier Loupe (`عدسة الدقة`) when dragging the four document corners.
   - Real client-side homography perspective rectification, mild curved-edge cleanup, rotation, and fine deskew (`-15°..+15°`).
2. **CamScanner Pro Filters & Batch Processing**:
   - **Magic Color (`ألوان سحرية`)**, **Clear Text (`نص واضح`)**, **White Paper (`تبييض الورقة`)**, **Paper Shadow Cleanup**, **Enhance**, **Grayscale**, and **Adaptive Black & White**.
   - **1-Tap Batch Filter** to apply any filter across all pages of a document simultaneously.
3. **ID Card 2-in-1 A4 Mode & Advanced PDF Export**:
   - Combine front & back of an ID Card / Iqama / Passport onto a single A4 sheet (`composeIdCardSheet`).
   - Optional automatic page numbering (`1 / N`) and diagonal security watermark.
   - Direct **"Sign this PDF" (`توقيع هذا الـ PDF`)** handoff from the scanner workspace straight into the signing studio.
4. **Signature, Official Stamp & Multi-Overlay Studio**:
   - Draw signatures in multiple official ink colors (Official Blue `#142b55`, Black, Red, Green) with adjustable pen thickness.
   - **Auto Paper Background Eraser**: import a photographed signature from the gallery and automatically strip the paper background into transparent ink.
   - **Official Electronic Stamps (`أختام رسمية`)**: generate dual-language stamps (`APPROVED / معتمد`, `CERTIFIED COPY / نسخة طبق الأصل`, `CONFIDENTIAL / سري للغاية`, `REVIEWED / تمت المراجعة`) + Date Stamps.
   - **Multi-Overlay Pinning & Opacity**: pin multiple stamps and signatures onto the same PDF page with adjustable ink opacity (`30%..100%`) and local **Signature Vault** persistence.
5. **Saudi ZATCA Tax Invoice QR Decoder & Document Library**:
   - Built-in TLV Base64 decoder & formatter (`src/lib/zatca.ts`) for Saudi e-Invoicing (ZATCA / الفوترة الإلكترونية) extracting Seller Name, 15-digit VAT Number, Timestamp, Total with VAT, and 15% VAT Amount into searchable document notes.
   - Smart categories (`عقود`, `فواتير`, `هويات`, `موقّعة`), multi-document merging (`دمج المستندات`), Dark Mode (`الوضع الداكن`), and JSON metadata backup export.

## Syncing to GitHub & Building Android APK

Run the bundled sync script from the project root:

```bash
bash sync-to-github.sh
```

Or on Windows:

```cmd
sync-to-github.bat
```

Pushing to `main` triggers `.github/workflows/android-debug-apk.yml`, which runs all Vitest suites, ESLint, builds the SPA shell, syncs Capacitor (`com.ahmedelmadni.memoscan`), and uploads both:
- `waraqah-android-debug-apk` (`app-debug.apk`)
- `waraqah-android-release-apk` (`waraqah-release-signed.apk`)
