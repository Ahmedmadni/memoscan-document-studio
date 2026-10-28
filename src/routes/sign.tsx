import { createFileRoute, Link } from "@tanstack/react-router";
import { PDFDocument } from "pdf-lib";
import { ArrowLeft, Download, Eraser, FileSignature, ImagePlus, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/sign")({
  head: () => ({ meta: [{ title: "Waraqah — Add signature" }] }),
  component: SignPage,
});

function SignPage() {
  const { lang } = useI18n();
  const ar = lang === "ar";
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [signature, setSignature] = useState<string | null>(null);
  const [signatureMode, setSignatureMode] = useState<"draw" | "image">("draw");
  const [placement, setPlacement] = useState({ x: 0.62, y: 0.72, width: 0.23 });
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  useEffect(() => {
    if (!pdfBytes || !previewRef.current) return;
    let cancelled = false;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const doc = await pdfjs.getDocument({ data: pdfBytes.slice(), disableWorker: true }).promise;
        if (cancelled) return;
        setPageCount(doc.numPages);
        const page = await doc.getPage(pageIndex + 1);
        const canvas = previewRef.current;
        if (!canvas) return;
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(760 / base.width, 920 / base.height, 1.5);
        const viewport = page.getViewport({ scale });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
      } catch {
        toast.error(ar ? "تعذر عرض هذا الملف. تأكد أنه PDF صالح وغير محمي." : "Couldn't preview this PDF. Check that it is valid and not password-protected.");
      }
    })();
    return () => { cancelled = true; };
  }, [pdfBytes, pageIndex, ar]);

  function startDraw(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(event.pointerId);
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo((event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height);
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#142b55";
    dragRef.current = { x: event.clientX, y: event.clientY, startX: 0, startY: 0 };
  }

  function moveDraw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current || signatureMode !== "draw") return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo((event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height);
    ctx.stroke();
  }

  function endDraw() {
    if (!dragRef.current) return;
    dragRef.current = null;
    const canvas = canvasRef.current;
    if (canvas) setSignature(canvas.toDataURL("image/png"));
  }

  async function choosePdf(file?: File) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error(ar ? "اختر ملف PDF صالحًا." : "Choose a valid PDF file.");
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = await PDFDocument.load(bytes, { ignoreEncryption: false });
      setPdfFile(file);
      setPdfBytes(bytes);
      setPageCount(parsed.getPageCount());
      setPageIndex(0);
      setPlacement({ x: 0.62, y: 0.72, width: 0.23 });
    } catch {
      toast.error(ar ? "تعذر فتح PDF. قد يكون الملف تالفًا أو محميًا بكلمة مرور." : "Couldn't open this PDF. It may be damaged or password-protected.");
    }
  }

  async function chooseSignature(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error(ar ? "اختر صورة PNG أو JPG أو WebP." : "Choose a PNG, JPG, or WebP image.");
      return;
    }
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("READ_FAILED"));
      reader.onerror = () => reject(new Error("READ_FAILED"));
      reader.readAsDataURL(file);
    });
    setSignature(data);
    setSignatureMode("image");
  }

  async function exportSignedPdf() {
    if (!pdfBytes || !signature) return;
    setBusy(true);
    try {
      const pdf = await PDFDocument.load(pdfBytes);
      const page = pdf.getPage(pageIndex);
      const png = await fetch(signature).then((response) => response.arrayBuffer());
      const image = signature.startsWith("data:image/png") ? await pdf.embedPng(png) : await pdf.embedJpg(png);
      const { width, height } = page.getSize();
      const drawWidth = width * placement.width;
      const drawHeight = drawWidth * image.height / image.width;
      page.drawImage(image, {
        x: width * placement.x,
        y: height * (1 - placement.y) - drawHeight,
        width: drawWidth,
        height: drawHeight,
      });
      const bytes = await pdf.save();
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (pdfFile?.name.replace(/\.pdf$/i, "") || "document") + "-signed.pdf";
      a.click();
      URL.revokeObjectURL(url);
      toast.success(ar ? "تم تصدير نسخة موقعة، والأصل لم يتغير." : "Signed copy exported. The original file was not changed.");
    } catch {
      toast.error(ar ? "تعذر تصدير النسخة الموقعة." : "Couldn't export the signed copy.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 pb-16">
        <div className="mb-6 flex items-center gap-3 pt-6">
          <Button variant="ghost" size="icon" asChild><Link to="/"><ArrowLeft /></Link></Button>
          <div>
            <h1 className="text-2xl font-bold">{ar ? "إضافة التوقيعات" : "Add signature"}</h1>
            <p className="text-sm text-muted-foreground">{ar ? "اختر PDF ثم ارسم توقيعك أو استورد صورة جاهزة." : "Choose a PDF, then draw a signature or import a ready image."}</p>
          </div>
        </div>

        <section className="mb-6 grid gap-4 rounded-2xl border bg-card p-4 md:grid-cols-2">
          <div>
            <h2 className="mb-2 font-semibold">{ar ? "1. ملف PDF" : "1. PDF document"}</h2>
            <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => void choosePdf(e.target.files?.[0])} />
            <Button onClick={() => fileInputRef.current?.click()}><Upload className="me-2 size-4" />{pdfFile ? pdfFile.name : ar ? "اختيار ملف PDF" : "Choose PDF"}</Button>
            <p className="mt-2 text-xs text-muted-foreground">{ar ? "يظل الملف الأصلي كما هو؛ سنصدر نسخة جديدة." : "Your original stays unchanged; a new copy will be exported."}</p>
          </div>
          <div>
            <h2 className="mb-2 font-semibold">{ar ? "2. مصدر التوقيع" : "2. Signature source"}</h2>
            <div className="flex flex-wrap gap-2">
              <Button variant={signatureMode === "draw" ? "default" : "outline"} onClick={() => setSignatureMode("draw")}><FileSignature className="me-2 size-4" />{ar ? "ارسم توقيعًا" : "Draw signature"}</Button>
              <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void chooseSignature(e.target.files?.[0])} />
              <Button variant="outline" onClick={() => imageInputRef.current?.click()}><ImagePlus className="me-2 size-4" />{ar ? "استيراد من الصور" : "Import from photos"}</Button>
            </div>
          </div>
        </section>

        {signatureMode === "draw" && (
          <section className="mb-6 rounded-2xl border bg-card p-4">
            <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">{ar ? "ارسم داخل المساحة" : "Draw in the box"}</h2><Button size="sm" variant="ghost" onClick={() => { const c = canvasRef.current; c?.getContext("2d")?.clearRect(0,0,c.width,c.height); setSignature(null); }}><Eraser className="me-2 size-4" />{ar ? "مسح" : "Clear"}</Button></div>
            <canvas ref={canvasRef} width={900} height={220} className="w-full touch-none rounded-xl border bg-white" style={{ height: 180 }} onPointerDown={startDraw} onPointerMove={moveDraw} onPointerUp={endDraw} onPointerCancel={endDraw} />
          </section>
        )}

        {signature && <section className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-4"><span className="text-sm font-medium">{ar ? "معاينة التوقيع" : "Signature preview"}</span><img src={signature} alt={ar ? "معاينة التوقيع" : "Signature preview"} className="h-16 max-w-56 object-contain" /><Button variant="ghost" size="sm" onClick={() => setSignature(null)}>{ar ? "إزالة" : "Remove"}</Button></section>}

        {pdfBytes && (
          <section className="rounded-2xl border bg-card p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-semibold">{ar ? "3. ضع التوقيع على الصفحة" : "3. Place the signature"}</h2><p className="text-xs text-muted-foreground">{ar ? "اسحب التوقيع لمكانه داخل الصفحة ثم صدّر النسخة." : "Drag the signature into position, then export a signed copy."}</p></div>
              <div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={pageIndex === 0} onClick={() => setPageIndex((p) => p - 1)}>{ar ? "السابقة" : "Previous"}</Button><span className="text-sm">{pageIndex + 1} / {pageCount}</span><Button variant="outline" size="sm" disabled={pageIndex + 1 >= pageCount} onClick={() => setPageIndex((p) => p + 1)}>{ar ? "التالية" : "Next"}</Button></div>
            </div>
            <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded border bg-muted">
              <canvas ref={previewRef} className="block h-auto max-w-full" />
              {signature && <img src={signature} alt="" draggable={false} onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); dragRef.current = { x: e.clientX, y: e.clientY, startX: placement.x, startY: placement.y }; }} onPointerMove={(e) => { if (!dragRef.current || !e.currentTarget.hasPointerCapture(e.pointerId)) return; const parent = e.currentTarget.parentElement; if (!parent) return; const rect = parent.getBoundingClientRect(); setPlacement((p) => ({ ...p, x: Math.max(0, Math.min(0.85, dragRef.current!.startX + (e.clientX - dragRef.current!.x) / rect.width)), y: Math.max(0, Math.min(0.9, dragRef.current!.startY + (e.clientY - dragRef.current!.y) / rect.height)) })); }} onPointerUp={() => { dragRef.current = null; }} className="absolute cursor-move touch-none object-contain" style={{ left: `${placement.x * 100}%`, top: `${placement.y * 100}%`, width: `${placement.width * 100}%`, maxHeight: "20%", border: "1px dashed #64748b" }} />}
            </div>
            <div className="mx-auto mt-4 flex max-w-xl items-center gap-3"><label htmlFor="signature-size" className="text-sm">{ar ? "حجم التوقيع" : "Signature size"}</label><input id="signature-size" type="range" min="0.1" max="0.5" step="0.01" value={placement.width} onChange={(e) => setPlacement((p) => ({ ...p, width: Number(e.target.value) }))} className="flex-1" /></div>
            <div className="mt-5 flex justify-end"><Button onClick={() => void exportSignedPdf()} disabled={!signature || busy}>{busy ? (ar ? "جارٍ التصدير…" : "Exporting…") : <><Download className="me-2 size-4" />{ar ? "تصدير PDF الموقّع" : "Export signed PDF"}</>}</Button></div>
          </section>
        )}
        <p className="mt-5 text-xs text-muted-foreground">{ar ? "هذا توقيع بصري مضاف إلى محتوى PDF، وليس توقيعًا رقميًا تشفيريًا قائمًا على شهادة." : "This adds a visual signature to the PDF; it is not a certificate-based cryptographic digital signature."}</p>
      </main>
    </div>
  );
}
