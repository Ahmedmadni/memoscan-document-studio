import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "ar" | "en";

const dict = {
  appName: { ar: "ماسح ميمو", en: "MemoScan" },
  tagline: {
    ar: "امسح مستنداتك بوضوح، وكل شيء يبقى على جهازك.",
    en: "Crisp document scans that never leave your device.",
  },
  langToggle: { ar: "English", en: "العربية" },
  privacy: { ar: "الخصوصية", en: "Privacy" },
  myDocs: { ar: "مستنداتي", en: "My documents" },
  newDoc: { ar: "مستند جديد", en: "New document" },
  scanCamera: { ar: "التقاط بالكاميرا", en: "Scan with camera" },
  importImages: { ar: "استيراد صور", en: "Import images" },
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
  errGeneric: { ar: "حدث خطأ غير متوقع.", en: "Something went wrong." },
  errStorage: {
    ar: "التخزين المحلي غير متاح في هذا المتصفح.",
    en: "Local storage isn't available in this browser.",
  },
  notFound: { ar: "المستند غير موجود.", en: "Document not found." },
  // editor
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
  fEnhance: { ar: "تحسين الألوان", en: "Enhance" },
  fGray: { ar: "رمادي", en: "Grayscale" },
  fBw: { ar: "أبيض وأسود", en: "Black & white" },
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
  // privacy
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
    const saved = localStorage.getItem("memoscan.lang");
    if (saved === "en" || saved === "ar") setLang(saved);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);
  const toggle = useCallback(() => {
    setLang((l) => {
      const n = l === "ar" ? "en" : "ar";
      localStorage.setItem("memoscan.lang", n);
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
