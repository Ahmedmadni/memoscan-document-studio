import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "ar" | "en";

const dict = {
  workspaceLabel: { ar: "مساحة عمل المستندات الذكية", en: "Smart document workspace" },
  homeSubtitle: { ar: "مستنداتك، بكل وضوح.", en: "Your documents, in order." },
  startWorkspace: { ar: "ابدأ عملك", en: "Start your work" },
  quickModesTitle: { ar: "أنماط المسح والتوثيق السريع", en: "Quick scan & signing modes" },
  modeStandardDoc: { ar: "مستند متعدد الصفحات", en: "Multi-page document" },
  modeIdCard2in1: { ar: "بطاقة هوية (وجهان في A4)", en: "ID Card (2-in-1 A4)" },
  modeZatcaInvoice: { ar: "قراءة فاتورة ضريبية", en: "Scan a tax invoice" },
  modeOfficialStamp: { ar: "ختم وتوقيع رسمي", en: "Official stamp & sign" },
  scanLabel: { ar: "ورق إلى PDF", en: "Paper to PDF" },
  signLabel: { ar: "توقيع على PDF", en: "Sign a PDF" },
  scanPageTitle: { ar: "مسح المستندات", en: "Scan documents" },
  selectSource: { ar: "مصدر الصفحات", en: "Page source" },
  scanCaption: { ar: "مستند جديد", en: "New scan" },
  localBadge: { ar: "محفوظة على جهازك", en: "Stored on your device" },
  recentDocs: { ar: "أحدث المستندات", en: "Recent documents" },
  viewAll: { ar: "عرض الكل", en: "View all" },
  navDocuments: { ar: "مستنداتي", en: "Documents" },
  searchDocs: { ar: "البحث عن مستند…", en: "Search documents…" },
  sortDocs: { ar: "ترتيب المستندات", en: "Sort documents" },
  sortNewest: { ar: "الأحدث أولًا", en: "Recently updated" },
  sortOldest: { ar: "الأقدم أولًا", en: "Oldest first" },
  sortName: { ar: "حسب الاسم", en: "By name" },
  noResults: { ar: "لا توجد مستندات مطابقة", en: "No matching documents" },
  clearSearch: { ar: "مسح البحث", en: "Clear search" },
  appLanguage: { ar: "لغة التطبيق", en: "App language" },
  arabic: { ar: "العربية", en: "Arabic" },
  english: { ar: "الإنجليزية", en: "English" },
  primaryNav: { ar: "التنقل الرئيسي", en: "Primary navigation" },
  developer: { ar: "أحمد المدني", en: "Ahmed Elmadani" },
  signTitle: { ar: "إضافة التوقيعات", en: "Add signature" },
  captureMode: { ar: "وضع التصوير", en: "Capture mode" },
  cameraReview: { ar: "مراجعة الصفحات", en: "Review pages" },
  approvePage: { ar: "اعتماد الصفحة", en: "Approve page" },
  approvedPage: { ar: "تم اعتماد الصفحة", en: "Page approved" },
  finishBatch: { ar: "إضافة الصفحات المعتمدة", en: "Add approved pages" },
  resumeCapture: { ar: "متابعة التصوير", en: "Continue capturing" },
  torchOn: { ar: "تشغيل الفلاش", en: "Turn light on" },
  torchOff: { ar: "إيقاف الفلاش", en: "Turn light off" },
  torchUnavailable: {
    ar: "الفلاش غير مدعوم لهذه الكاميرا",
    en: "Light is not supported by this camera",
  },
  switchCamera: { ar: "تبديل الكاميرا", en: "Switch camera" },
  cameraZoom: { ar: "التقريب", en: "Zoom" },
  cameraGrid: { ar: "شبكة المحاذاة", en: "Alignment grid" },
  autoCapture: { ar: "التقاط تلقائي عند الثبات", en: "Auto-capture when steady" },
  autoCapturing: { ar: "ثبّت اليد… جارٍ الالتقاط التلقائي", en: "Hold steady… auto-capturing" },
  cameraControlFailed: {
    ar: "تعذر تغيير إعداد الكاميرا على هذا الجهاز.",
    en: "Couldn’t change this camera setting on your device.",
  },
  systemCamera: { ar: "استخدام كاميرا الجهاز", en: "Use device camera" },
  singleShot: { ar: "فردي", en: "Single" },
  multiShot: { ar: "متسلسل", en: "Batch" },
  livePageEdges: { ar: "حدود الورقة المكتشفة", en: "Detected page edges" },
  navHome: { ar: "الرئيسية", en: "Home" },
  navScan: { ar: "مسح", en: "Scan" },
  navSign: { ar: "توقيع", en: "Sign" },
  navSettings: { ar: "الإعدادات", en: "Settings" },
  signScope: { ar: "نطاق التوقيع", en: "Signature scope" },
  signCurrentPage: { ar: "الصفحة الحالية فقط", en: "Current page only" },
  signAllPages: { ar: "كل صفحات الملف", en: "All PDF pages" },
  scanDocuments: { ar: "مسح المستندات", en: "Scan Documents" },
  addSignature: { ar: "إضافة توقيع", en: "Add Signature" },
  signIntro: {
    ar: "اختر PDF ثم ارسم توقيعك أو استورد صورة جاهزة.",
    en: "Choose a PDF, then draw a signature or import a ready image.",
  },
  signPdf: { ar: "1. ملف PDF", en: "1. PDF document" },
  choosePdf: { ar: "اختيار ملف PDF", en: "Choose PDF" },
  signOriginal: {
    ar: "يظل الملف الأصلي كما هو؛ سنصدر نسخة جديدة.",
    en: "Your original stays unchanged; a new copy will be exported.",
  },
  signSource: { ar: "2. مصدر التوقيع", en: "2. Signature source" },
  signDraw: { ar: "ارسم توقيعًا", en: "Draw signature" },
  signImport: { ar: "استيراد من الصور", en: "Import from photos" },
  signStamp: { ar: "ختم إلكتروني", en: "Official stamp" },
  signDateStamp: { ar: "ختم التاريخ", en: "Date stamp" },
  signBox: { ar: "ارسم داخل المساحة", en: "Draw in the box" },
  clear: { ar: "مسح", en: "Clear" },
  signPreview: { ar: "معاينة التوقيع", en: "Signature preview" },
  remove: { ar: "إزالة", en: "Remove" },
  signPlace: { ar: "3. ضع التوقيع على الصفحة", en: "3. Place the signature" },
  previous: { ar: "السابقة", en: "Previous" },
  next: { ar: "التالية", en: "Next" },
  signSize: { ar: "حجم التوقيع", en: "Signature size" },
  signOpacity: { ar: "شفافية التوقيع / الختم", en: "Signature / stamp opacity" },
  pinOverlay: { ar: "تثبيت على الصفحة وإضافة ختم آخر", en: "Pin to page & add another" },
  pinnedOverlays: { ar: "عناصر مثبتة على المستند", en: "Pinned page overlays" },
  clearPinned: { ar: "مسح العناصر المثبتة", en: "Clear pinned items" },
  docSha256Label: { ar: "البصمة الرقمية للمستند (SHA-256)", en: "Document SHA-256 fingerprint" },
  includeAuditFooter: {
    ar: "طباعة شريط البصمة الرقمية والتدقيق الزمني أسفل الصفحات",
    en: "Print SHA-256 audit & UTC timestamp footer on pages",
  },
  signExport: { ar: "تصدير PDF الموقّع", en: "Export signed PDF" },
  exporting: { ar: "جارٍ التصدير…", en: "Exporting…" },
  signDisclaimer: {
    ar: "هذا توقيع بصري مضاف إلى محتوى PDF، وليس توقيعًا رقميًا تشفيريًا قائمًا على شهادة.",
    en: "This adds a visual signature to the PDF; it is not a certificate-based cryptographic digital signature.",
  },
  signBadPdf: {
    ar: "تعذر فتح PDF. قد يكون الملف تالفًا أو محميًا بكلمة مرور.",
    en: "Couldn’t open this PDF. It may be damaged or password-protected.",
  },
  signBadImage: { ar: "اختر صورة PNG أو JPG صالحة.", en: "Choose a valid PNG or JPG image." },
  signBlank: {
    ar: "التوقيع فارغ. ارسم توقيعًا أو اختر صورة تحتوي على توقيع واضح.",
    en: "The signature is blank. Draw a signature or choose an image with visible ink.",
  },
  signPreviewError: {
    ar: "تعذر عرض هذا الملف. جرّب ملف PDF آخر.",
    en: "Couldn’t preview this PDF. Try another PDF.",
  },
  signExportError: {
    ar: "تعذر تصدير النسخة الموقعة. حاول مرة أخرى.",
    en: "Couldn’t export the signed copy. Please try again.",
  },
  signSuccess: {
    ar: "تم تصدير نسخة موقعة، والأصل لم يتغير.",
    en: "Signed copy exported. The original file was not changed.",
  },
  signPreviewLoading: { ar: "جارٍ عرض الصفحة…", en: "Loading page preview…" },
  inkColor: { ar: "لون الحبر", en: "Ink color" },
  inkBlue: { ar: "أزرق رسمي", en: "Official Blue" },
  inkBlack: { ar: "أسود", en: "Black" },
  inkRed: { ar: "أحمر", en: "Red" },
  inkGreen: { ar: "أخضر", en: "Green" },
  penWidth: { ar: "سُمك القلم", en: "Pen width" },
  autoRemoveBg: { ar: "تفريغ خلفية الورق تلقائيًا", en: "Auto-remove paper background" },
  saveToVault: { ar: "حفظ التوقيع للاستخدام السريع", en: "Save signature for quick reuse" },
  savedSignatures: { ar: "التوقيعات والأختام المحفوظة", en: "Saved signatures & stamps" },
  stampType: { ar: "نوع الختم", en: "Stamp preset" },
  stampApproved: { ar: "معتمد / APPROVED", en: "APPROVED / معتمد" },
  stampCertified: { ar: "نسخة طبق الأصل", en: "CERTIFIED COPY" },
  stampConfidential: { ar: "سري للغاية", en: "CONFIDENTIAL" },
  stampReviewed: { ar: "تمت المراجعة", en: "REVIEWED" },
  stampHolder: { ar: "اسم الجهة أو الموقّع", en: "Organization or signer" },
  applyStamp: { ar: "إنشاء الختم", en: "Create stamp" },
  watermarkLabel: { ar: "علامة مائية (اختياري)", en: "Watermark text (optional)" },
  watermarkPlaceholder: {
    ar: "مثال: نسخة أصلية - أحمد المدني",
    en: "e.g. CONFIDENTIAL - Ahmed Elmadani",
  },
  signThisPdf: { ar: "توقيع هذا الـ PDF", en: "Sign this PDF" },
  batchFilterLabel: { ar: "تطبيق فلتر سريع على كل الصفحات", en: "Quick filter for all pages" },
  applyToAllPagesBtn: { ar: "تطبيق على كل الصفحات", en: "Apply to all pages" },
  appliedToAll: { ar: "تم تطبيق الإعدادات على جميع الصفحات", en: "Applied to all pages" },
  pageNumbers: { ar: "ترقيم الصفحات", en: "Page numbers" },
  layoutMode: { ar: "تخطيط التصدير", en: "Export layout" },
  layoutStandard: { ar: "قياسي (صفحة لكل صورة)", en: "Standard (1 per page)" },
  layoutIdCard: { ar: "بطاقة هوية (وجهان في A4)", en: "ID Card (2-in-1 A4)" },
  ocrNotesTitle: { ar: "النص المستخرج وملاحظات المستند", en: "Extracted text & document notes" },
  ocrNotesPlaceholder: {
    ar: "أضف نص المستند أو ملاحظات قابلة للبحث والنسخ…",
    en: "Add extracted text or searchable notes for this document…",
  },
  autoAnalyzePage: { ar: "تحليل بيانات الصفحات", en: "Analyze page metadata" },
  selectedPagePreview: { ar: "معاينة الصفحة المحددة", en: "Selected page preview" },
  editSelectedPage: { ar: "ضبط الصفحة", en: "Adjust page" },
  zatcaTitle: { ar: "قارئ الفواتير الإلكترونية", en: "E-invoice QR reader" },
  zatcaPlaceholder: { ar: "الصق محتوى رمز QR", en: "Paste the QR code payload" },
  zatcaDecodeBtn: { ar: "فحص الرمز", en: "Check code" },
  zatcaSuccess: { ar: "تمت قراءة الحقول الأساسية للفاتورة", en: "Basic invoice fields decoded" },
  zatcaInvalid: {
    ar: "تعذر قراءة الحقول الأساسية لرمز فاتورة سعودية صالح.",
    en: "This code does not contain valid basic Saudi invoice fields.",
  },
  invoiceQrUnreadable: {
    ar: "تعذر قراءة رمز QR. جرّب صورة أوضح للرمز.",
    en: "QR code unreadable. Try a clearer image of the code.",
  },
  invoiceScan: { ar: "مسح بالكاميرا", en: "Scan with camera" },
  invoiceStopScan: { ar: "إيقاف المسح", en: "Stop scanning" },
  invoiceScanHint: {
    ar: "وجّه الكاميرا نحو رمز QR المطبوع على الفاتورة.",
    en: "Point the camera at the QR code printed on the invoice.",
  },
  invoiceImage: { ar: "قراءة من صورة", en: "Read from image" },
  invoiceQrText: { ar: "محتوى رمز الفاتورة", en: "Invoice QR payload" },
  invoiceSeller: { ar: "اسم البائع", en: "Seller name" },
  invoiceVatNumber: { ar: "الرقم الضريبي", en: "VAT registration number" },
  invoiceTimestamp: { ar: "تاريخ ووقت الفاتورة", en: "Invoice date and time" },
  invoiceTotal: { ar: "الإجمالي شامل الضريبة", en: "Total including VAT" },
  invoiceVatAmount: { ar: "مبلغ ضريبة القيمة المضافة", en: "VAT amount" },
  invoiceSaveNotes: { ar: "حفظ البيانات في ملاحظات المستند", en: "Save fields to document notes" },
  invoiceValidationLimit: {
    ar: "الفحص داخل التطبيق يراجع حقول الرمز. استخدم خدمة هيئة الزكاة والضريبة والجمارك للتحقق الرسمي من أصالة الفاتورة.",
    en: "This app checks the QR fields. Use ZATCA's service to officially verify invoice authenticity.",
  },
  invoiceOfficialCheck: { ar: "فتح خدمة التحقق لدى الهيئة", en: "Open ZATCA verification service" },
  themeMode: { ar: "مظهر التطبيق", en: "Appearance" },
  themeLight: { ar: "فاتح", en: "Light" },
  themeDark: { ar: "داكن", en: "Dark" },
  backupTitle: { ar: "النسخ الاحتياطي وإحصائيات التخزين", en: "Local backup & storage stats" },
  exportBackup: { ar: "تصدير فهرس المستندات (JSON)", en: "Export metadata backup (JSON)" },
  backupSuccess: { ar: "تم تصدير ملف النسخة الاحتياطية", en: "Backup exported" },
  storageStats: { ar: "المستندات المحفوظة محليًا", en: "Locally stored documents" },
  copyText: { ar: "نسخ النص", en: "Copy text" },
  copiedText: { ar: "تم نسخ النص", en: "Text copied" },
  docCategory: { ar: "التصنيف", en: "Category" },
  catAll: { ar: "الكل", en: "All" },
  catContracts: { ar: "عقود", en: "Contracts" },
  catInvoices: { ar: "فواتير", en: "Invoices" },
  catIds: { ar: "هويات", en: "IDs" },
  catSigned: { ar: "موقّعة", en: "Signed" },
  mergeDocs: { ar: "دمج مستندات", en: "Merge documents" },
  mergeSelected: { ar: "دمج المحدد", en: "Merge selected" },
  cancelMerge: { ar: "إلغاء الدمج", en: "Cancel merge" },
  mergedSuccess: { ar: "تم دمج المستندات في ملف جديد", en: "Documents merged into a new file" },
  loupeLabel: { ar: "عدسة الدقة", en: "Precision loupe" },
  appName: { ar: "ورقة", en: "Waraqah" },
  tagline: {
    ar: "من الورق إلى ملف جاهز — في ثوانٍ.",
    en: "From paper to a polished file — in seconds.",
  },
  langToggle: { ar: "English", en: "العربية" },
  privacy: { ar: "الخصوصية", en: "Privacy" },
  myDocs: { ar: "مستنداتي", en: "My documents" },
  newDoc: { ar: "مستند جديد", en: "New document" },
  scanCamera: { ar: "التقاط بالكاميرا", en: "Scan with camera" },
  importImages: { ar: "استيراد صور", en: "Import images" },
  cameraUnavailable: {
    ar: "تعذر فتح الكاميرا داخل التطبيق. تحقق من صلاحية الكاميرا أو استخدم استيراد الصور.",
    en: "Couldn't open the in-app camera. Check camera permission or import images instead.",
  },
  cameraStarting: { ar: "جارٍ تشغيل الكاميرا…", en: "Starting camera…" },
  capturePage: { ar: "التقاط صفحة", en: "Capture page" },
  capturedPages: { ar: "الصفحات الملتقطة", en: "Captured pages" },
  useCaptured: { ar: "مراجعة وإضافة", en: "Review & add" },
  removeCaptured: { ar: "حذف الصورة الملتقطة", en: "Remove captured image" },
  captureFailed: {
    ar: "تعذر حفظ الصورة. حاول مرة أخرى.",
    en: "Couldn't save the photo. Please try again.",
  },
  emptyTitle: { ar: "لا توجد مستندات بعد", en: "No documents yet" },
  emptyBody: {
    ar: "ابدأ بالتقاط صورة لورقة أو استيراد صور من جهازك.",
    en: "Start by photographing a page or importing images from your device.",
  },
  step1: { ar: "صوّر الورقة على خلفية داكنة", en: "Shoot the page on a darker background" },
  step2: { ar: "اضبط الزوايا الأربع والفلاتر", en: "Adjust the four corners and filters" },
  step3: { ar: "صدّر ملف PDF متعدد الصفحات", en: "Export a multi‑page PDF" },
  pages: { ar: "صفحات", en: "pages" },
  page: { ar: "صفحة", en: "Page" },
  open: { ar: "فتح", en: "Open" },
  delete: { ar: "حذف", en: "Delete" },
  confirmDeleteDoc: {
    ar: "حذف هذا المستند وكل صفحاته نهائيًا؟",
    en: "Delete this document and all its pages permanently?",
  },
  pageDeleted: { ar: "تم حذف الصفحة", en: "Page deleted" },
  confirmDeletePage: { ar: "حذف هذه الصفحة؟", en: "Delete this page?" },
  loading: { ar: "جارٍ التحميل…", en: "Loading…" },
  processing: { ar: "جارٍ المعالجة", en: "Processing" },
  back: { ar: "رجوع", en: "Back" },
  docName: { ar: "اسم المستند", en: "Document name" },
  untitled: { ar: "مستند", en: "Scan" },
  addPages: { ar: "إضافة صفحات", en: "Add pages" },
  noPages: {
    ar: "هذا المستند فارغ. أضف صفحة بالكاميرا أو من الصور.",
    en: "This document is empty. Add a page from the camera or your photos.",
  },
  edit: { ar: "تحرير", en: "Edit" },
  moveEarlier: { ar: "تقديم", en: "Move earlier" },
  moveLater: { ar: "تأخير", en: "Move later" },
  dragToReorder: { ar: "اسحب لإعادة الترتيب", en: "Drag to reorder" },
  reorderHint: {
    ar: "اسحب الصفحات لإعادة ترتيبها، أو استخدم زرَّي التقديم والتأخير.",
    en: "Drag pages to reorder them, or use the move earlier/later buttons.",
  },
  duplicate: { ar: "تكرار", en: "Duplicate" },
  replace: { ar: "استبدال", en: "Replace" },
  autoBadge: { ar: "حواف مكتشفة تلقائيًا", en: "Edges auto‑detected" },
  manualBadge: {
    ar: "لم تُكتشف الحواف — اضبطها يدويًا",
    en: "Edges not detected — adjust manually",
  },
  exportMoreOptions: { ar: "خيارات إضافية", en: "More options" },
  exportTitle: { ar: "تصدير PDF", en: "Export PDF" },
  quality: { ar: "الجودة", en: "Quality" },
  qHigh: { ar: "عالية", en: "High" },
  qMedium: { ar: "متوسطة", en: "Medium" },
  qSmall: { ar: "حجم صغير", en: "Small file" },
  pageSize: { ar: "مقاس الصفحة", en: "Page size" },
  sizeFit: { ar: "حسب الصورة", en: "Fit to image" },
  sizeA4: { ar: "A4", en: "A4" },
  buildPdf: { ar: "إنشاء PDF", en: "Create PDF" },
  download: { ar: "تنزيل", en: "Download" },
  share: { ar: "مشاركة", en: "Share" },
  shareUnavailable: {
    ar: "المشاركة غير مدعومة في هذا المتصفح — استخدم التنزيل.",
    en: "Sharing isn't supported in this browser — use Download.",
  },
  pdfReady: { ar: "ملف PDF جاهز", en: "PDF ready" },
  shared: { ar: "تمت المشاركة", en: "Shared" },
  errImage: {
    ar: "تعذر قراءة الصورة. جرّب JPG أو PNG.",
    en: "Couldn't read this image. Try JPG or PNG.",
  },
  errHeic: {
    ar: "صيغة HEIC/HEIF غير مدعومة على هذا الجهاز. حوّل الصورة إلى JPG أو PNG ثم أعد استيرادها.",
    en: "HEIC/HEIF isn’t supported on this device. Convert the image to JPG or PNG and import it again.",
  },
  errGeneric: { ar: "حدث خطأ غير متوقع.", en: "Something went wrong." },
  errStorage: {
    ar: "التخزين المحلي غير متاح في هذا المتصفح.",
    en: "Local storage isn't available in this browser.",
  },
  notFound: { ar: "المستند غير موجود.", en: "Document not found." },
  corners: { ar: "الزوايا", en: "Corners" },
  adjust: { ar: "التحسين", en: "Adjust" },
  autoDetect: { ar: "كشف تلقائي", en: "Auto‑detect" },
  autoDetectNote: {
    ar: "الكشف التلقائي تقريبي ويعمل أفضل مع ورقة فاتحة على خلفية داكنة.",
    en: "Auto‑detect is heuristic; it works best with a light page on a darker background.",
  },
  detectFailed: {
    ar: "لم يُعثر على حواف واضحة. اسحب الزوايا يدويًا.",
    en: "No clear edges found. Drag the corners manually.",
  },
  fullImage: { ar: "الصورة كاملة", en: "Full image" },
  dragHint: {
    ar: "اسحب النقاط الأربع إلى زوايا الورقة. يتم تصحيح المنظور فعليًا.",
    en: "Drag the four points to the page corners. A real perspective correction is applied.",
  },
  rotateL: { ar: "تدوير يسارًا", en: "Rotate left" },
  rotateR: { ar: "تدوير يمينًا", en: "Rotate right" },
  deskew: { ar: "تقويم الميل", en: "Deskew" },
  fOriginal: { ar: "أصلي", en: "Original" },
  fMagic: { ar: "ألوان سحرية (Magic)", en: "Magic Color" },
  fEnhance: { ar: "تحسين الألوان", en: "Enhance" },
  fGray: { ar: "رمادي", en: "Grayscale" },
  fBw: { ar: "أبيض وأسود", en: "Black & white" },
  fClean: { ar: "تنظيف ظلال الورق", en: "Paper shadow cleanup" },
  fPaper: { ar: "تبييض الورقة", en: "White paper" },
  fText: { ar: "نص واضح", en: "Clear text" },
  curvedEdges: { ar: "تسوية حواف الورق المموج", en: "Straighten curved paper edges" },
  curvedEdgesLimit: {
    ar: "للتموج الخفيف على خلفية داكنة؛ الطيات الشديدة أو النص المخفي قد تحتاج إعادة التصوير.",
    en: "For mild curl on a dark background; severe folds or hidden writing may need a new photo.",
  },
  brightness: { ar: "السطوع", en: "Brightness" },
  contrast: { ar: "التباين", en: "Contrast" },
  sharpen: { ar: "الحدة", en: "Sharpen" },
  threshold: { ar: "عتبة الأبيض والأسود", en: "B&W threshold" },
  compare: { ar: "قبل / بعد", en: "Before / after" },
  before: { ar: "قبل", en: "Before" },
  after: { ar: "بعد", en: "After" },
  undo: { ar: "تراجع", en: "Undo" },
  redo: { ar: "إعادة", en: "Redo" },
  save: { ar: "حفظ", en: "Save" },
  cancel: { ar: "إلغاء", en: "Cancel" },
  saved: { ar: "تم الحفظ", en: "Saved" },
  reset: { ar: "إعادة الضبط", en: "Reset" },
  privacyTitle: { ar: "الخصوصية والتخزين", en: "Privacy & storage" },
  privacy1: {
    ar: "تتم معالجة الصور بالكامل داخل متصفحك على جهازك. لا يتم رفع أي صورة أو مستند إلى أي خادم.",
    en: "All image processing runs inside your browser on your device. No image or document is uploaded to any server.",
  },
  privacy2: {
    ar: "تُحفظ المستندات في التخزين المحلي للمتصفح (IndexedDB) على هذا الجهاز فقط. مسح بيانات الموقع يحذفها.",
    en: "Documents are saved in your browser's local storage (IndexedDB) on this device only. Clearing site data deletes them.",
  },
  privacy3: {
    ar: "لا حسابات، ولا تتبع، ولا خدمات مدفوعة. المشاركة تتم عبر قائمة المشاركة في جهازك فقط عندما تختار ذلك.",
    en: "No accounts, no tracking, no paid services. Sharing only happens through your device's share sheet when you choose it.",
  },
  privacyShort: {
    ar: "كل المعالجة والتخزين على جهازك فقط.",
    en: "All processing and storage stay on your device.",
  },
} satisfies Record<string, Record<Lang, string>>;

export type TKey = keyof typeof dict;

interface Ctx {
  lang: Lang;
  dir: "rtl" | "ltr";
  t: (k: TKey) => string;
  toggle: () => void;
}

const I18nCtx = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("ar");
  useEffect(() => {
    const saved = localStorage.getItem("waraqah.lang");
    if (saved === "en" || saved === "ar") setLang(saved);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);
  const toggle = useCallback(() => {
    setLang((l) => {
      const n = l === "ar" ? "en" : "ar";
      localStorage.setItem("waraqah.lang", n);
      return n;
    });
  }, []);
  const t = useCallback((k: TKey) => dict[k][lang], [lang]);
  return (
    <I18nCtx.Provider value={{ lang, dir: lang === "ar" ? "rtl" : "ltr", t, toggle }}>
      {children}
    </I18nCtx.Provider>
  );
}

export function useI18n() {
  const c = useContext(I18nCtx);
  if (!c) throw new Error("useI18n outside provider");
  return c;
}
