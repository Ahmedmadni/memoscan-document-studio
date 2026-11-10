import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileSignature,
  FileText,
  GripVertical,
  Loader2,
  Pencil,
  RefreshCw,
  Share2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { InvoiceQrReader } from "@/components/InvoiceQrReader";
import { ImagePickers } from "@/components/ImagePickers";
import { PageEditor } from "@/components/PageEditor";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  getDoc,
  getPages,
  putDoc,
  putPage,
  uid,
  type DocCategory,
  type DocRecord,
  type PageRecord,
} from "@/lib/db";
import {
  addFilesToDoc,
  applyFilterToAllPages,
  insertAfter,
  movePage,
  reorderPages,
} from "@/lib/docOps";
import { errorKey } from "@/lib/errors";
import { useI18n, type TKey } from "@/lib/i18n";
import type { FilterMode } from "@/lib/imaging";
import { buildPage, renderOutputs } from "@/lib/pages";
import { PendingDeletes } from "@/lib/pendingDeletes";
import { isNative } from "@/lib/native";
import {
  canShareFile,
  downloadBlob,
  exportPdf,
  formatBytes,
  safeFilename,
  setPendingSignPdf,
  shareFile,
  type PdfLayoutMode,
  type PdfPageSize,
  type PdfQuality,
} from "@/lib/pdf";
import { formatZatcaSummary, type ZatcaInvoiceData } from "@/lib/zatca";

export const Route = createFileRoute("/doc/$id")({
  head: () => ({
    meta: [
      { title: "Document — Waraqah" },
      {
        name: "description",
        content: "Edit scanned pages, arrange document order and export PDFs on your device.",
      },
      { property: "og:title", content: "Document — Waraqah" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        property: "og:description",
        content: "Private on-device page editing, ordering and PDF export.",
      },
    ],
  }),
  component: DocPage,
});

const BATCH_FILTERS: [FilterMode, TKey][] = [
  ["magic", "fMagic"],
  ["text", "fText"],
  ["paper", "fPaper"],
  ["enhance", "fEnhance"],
  ["bw", "fBw"],
  ["original", "fOriginal"],
];

function DocPage() {
  const { id } = Route.useParams();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<DocRecord | null | undefined>(undefined);
  const [pages, setPages] = useState<PageRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<PageRecord | null>(null);
  const [quality, setQuality] = useState<PdfQuality>("medium");
  const [size, setSize] = useState<PdfPageSize>("fit");
  const [layout, setLayout] = useState<PdfLayoutMode>("standard");
  const [pageNumbers, setPageNumbers] = useState(false);
  const [watermarkText, setWatermarkText] = useState("");
  const [notes, setNotes] = useState("");
  const [pdf, setPdf] = useState<Blob | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);
  const exportSectionRef = useRef<HTMLElement>(null);
  // Soft deletes awaiting undo or finalization; finalized on unmount.
  const pendingDeletes = useRef<PendingDeletes | null>(null);
  pendingDeletes.current ??= new PendingDeletes(6000);
  useEffect(() => () => pendingDeletes.current?.dispose(), []);
  // A small movement threshold keeps taps (open editor) from starting a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    try {
      const d = await getDoc(id);
      setDoc(d ?? null);
      if (d) {
        setNotes(d.notes ?? "");
        setPages(await getPages(d));
      }
    } catch (e) {
      toast.error(t(errorKey(e)));
      setDoc(null);
    }
  }, [id, t]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => setPdf(null), [pages, quality, size, layout, pageNumbers, watermarkText]);

  async function saveOrder(ids: string[], d = doc) {
    if (!d) return;
    const next = { ...d, pageIds: ids, updatedAt: Date.now() };
    await putDoc(next);
    setDoc(next);
    setPages(await getPages(next));
  }
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast.error(t(errorKey(e)));
    } finally {
      setBusy(null);
    }
  };

  if (doc === undefined)
    return (
      <Shell>
        <p className="flex gap-2 text-muted-foreground">
          <Loader2 className="animate-spin" />
          {t("loading")}
        </p>
      </Shell>
    );
  if (doc === null)
    return (
      <Shell>
        <p>{t("notFound")}</p>
        <Link to="/documents" className="text-primary underline">
          {t("back")}
        </Link>
      </Shell>
    );

  const ids = doc.pageIds;
  const move = (i: number, d: number) => void run("", () => saveOrder(movePage(ids, i, d)));
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    const next = reorderPages(ids, from, to);
    if (next !== ids) void run("", () => saveOrder(next));
  };
  const softDeletePage = (p: PageRecord) => {
    const manager = pendingDeletes.current;
    if (!manager) return;
    void run("", async () => {
      const next = manager.softDelete(ids, p.id);
      if (next === ids) return;
      await saveOrder(next);
      const finalize = () => void manager.finalize(p.id);
      toast(t("pageDeleted"), {
        duration: 6000,
        action: {
          label: t("undo"),
          onClick: () => {
            void run("", async () => {
              const fresh = await getDoc(doc.id);
              if (!fresh) return;
              const restored = manager.undo(fresh.pageIds, p.id);
              if (restored) await saveOrder(restored, fresh);
            });
          },
        },
        onAutoClose: finalize,
        onDismiss: finalize,
      });
    });
  };

  async function saveInvoiceNotes(invoice: ZatcaInvoiceData) {
    if (!doc) return;
    const block = formatZatcaSummary(invoice, lang);
    if (notes.includes(block)) return;
    const nextNotes = notes ? `${notes}\n\n${block}` : block;
    const next = {
      ...doc,
      notes: nextNotes,
      category: doc.category ?? "invoices",
      updatedAt: Date.now(),
    } satisfies DocRecord;
    await putDoc(next);
    setDoc(next);
    setNotes(nextNotes);
  }

  async function triggerSignHandoff() {
    if (!doc) return;
    await run(t("processing"), async () => {
      const built =
        pdf ??
        (await exportPdf(
          pages,
          { quality, pageSize: size, layout, pageNumbers, watermarkText },
          (a, b) => setBusy(`${t("processing")} ${a}/${b}`),
        ));
      const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(built);
      });
      setPendingSignPdf(safeFilename(doc.name), new Uint8Array(buf));
      await navigate({ to: "/sign" });
    });
  }

  return (
    <div className="min-h-screen pb-24">
      <AppHeader
        start={
          <Link
            to="/documents"
            aria-label={t("back")}
            className="grid size-9 place-items-center rounded-md hover:bg-muted"
          >
            <ArrowLeft className="size-5 rtl:rotate-180" />
          </Link>
        }
      />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 pb-20">
        {/* CamScanner Document Header Card */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-5">
          <div className="min-w-0 flex-1">
            <input
              aria-label={t("docName")}
              defaultValue={doc.name}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && name !== doc.name) void run("", () => saveOrder(ids, { ...doc, name }));
              }}
              className="w-full rounded-lg border-0 bg-transparent font-display text-xl font-bold outline-none focus:ring-2 focus:ring-ring md:text-2xl"
            />
            <p className="mt-0.5 text-xs text-muted-foreground">
              {pages.length} {t("pages")} ·{" "}
              {new Date(doc.updatedAt).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              aria-label={t("docCategory")}
              value={doc.category ?? ""}
              onChange={(e) => {
                const val = (e.target.value || undefined) as DocCategory | undefined;
                void run("", () => saveOrder(ids, { ...doc, category: val }));
              }}
              className="h-9 rounded-lg border bg-background px-3 text-xs font-medium"
            >
              <option value="">{t("docCategory")}: —</option>
              <option value="contracts">{t("catContracts")}</option>
              <option value="invoices">{t("catInvoices")}</option>
              <option value="ids">{t("catIds")}</option>
              <option value="signed">{t("catSigned")}</option>
            </select>
            {pages.length > 0 && (
              <Button
                size="sm"
                onClick={() =>
                  exportSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                aria-label={t("exportTitle")}
                className="gap-1.5 rounded-lg font-bold"
              >
                <FileText className="size-4" />
                PDF
              </Button>
            )}
          </div>
        </div>

        <ImagePickers
          size="default"
          disabled={!!busy}
          onFiles={(files, edits) =>
            run(t("processing"), async () => {
              const r = await addFilesToDoc(
                doc.id,
                files,
                (a, b) => setBusy(`${t("processing")} ${a}/${b}`),
                edits,
              );
              if (r.failed) toast.error(t(errorKey(r.firstError)));
              await load();
            })
          }
        />
        {busy && (
          <p role="status" className="flex items-center gap-2 text-sm text-primary">
            <Loader2 className="size-4 animate-spin" />
            {busy}
          </p>
        )}

        {pages.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
            {t("noPages")}
          </p>
        ) : (
          <>
            {/* CamScanner Quick Batch Filter Bar */}
            <div className="flex items-center gap-2 overflow-x-auto border-y py-3">
              <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-primary">
                <Sparkles className="size-4" />
                {t("batchFilterLabel")}:
              </span>
              {BATCH_FILTERS.map(([f, labelKey]) => (
                <Button
                  variant="outline"
                  key={f}
                  disabled={!!busy}
                  onClick={() =>
                    void run(t("processing"), async () => {
                      await applyFilterToAllPages(doc.id, f, (a, b) =>
                        setBusy(`${t("processing")} ${a}/${b}`),
                      );
                      await load();
                      toast.success(t("appliedToAll"));
                    })
                  }
                  className="shrink-0 text-xs"
                >
                  {t(labelKey)}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("reorderHint")}</p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={ids} strategy={rectSortingStrategy}>
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {pages.map((p, i) => (
                    <SortablePageCard
                      key={p.id}
                      page={p}
                      index={i}
                      total={pages.length}
                      onEdit={() => setEditing(p)}
                      onMove={(d) => move(i, d)}
                      onDuplicate={() =>
                        run("", async () => {
                          const copy = { ...p, id: uid(), createdAt: Date.now() };
                          await putPage(copy);
                          await saveOrder(insertAfter(ids, i, copy.id));
                        })
                      }
                      onReplace={() => {
                        replaceTarget.current = p.id;
                        replaceInput.current?.click();
                      }}
                      onDelete={() => softDeletePage(p)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </>
        )}
        <input
          ref={replaceInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            const pid = replaceTarget.current;
            if (f && pid)
              void run(t("processing"), async () => {
                await putPage(await buildPage(doc.id, f, pid));
                await load();
              });
          }}
        />

        {pages.length > 0 && (
          <section className="space-y-4 border-t pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{t("ocrNotesTitle")}</h2>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const summary = pages
                      .map(
                        (p, idx) =>
                          `[${t("page")} ${idx + 1}: ${p.width}×${p.height}px · ${p.settings.filter}]`,
                      )
                      .join("\n");
                    const nextNotes = notes ? `${notes}\n${summary}` : summary;
                    setNotes(nextNotes);
                    void run("", () => saveOrder(ids, { ...doc, notes: nextNotes }));
                  }}
                >
                  {t("autoAnalyzePage")}
                </Button>
                {notes && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard?.writeText(notes);
                      toast.success(t("copiedText"));
                    }}
                  >
                    <Copy className="me-1 size-3.5" />
                    {t("copyText")}
                  </Button>
                )}
              </div>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (notes !== (doc.notes ?? "")) {
                  void run("", () => saveOrder(ids, { ...doc, notes }));
                }
              }}
              placeholder={t("ocrNotesPlaceholder")}
              rows={3}
              className="w-full rounded-xl border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />

            <h2 className="text-sm font-semibold">{t("zatcaTitle")}</h2>
            <InvoiceQrReader onSave={saveInvoiceNotes} />
          </section>
        )}

        {pages.length > 0 && (
          <section
            ref={exportSectionRef}
            className="scroll-mt-20 space-y-3 border-t pt-5"
          >
            <h2 className="text-lg font-semibold">{t("exportTitle")}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <ExportSelect
                label={t("quality")}
                value={quality}
                onChange={setQuality}
                options={[
                  ["high", t("qHigh")],
                  ["medium", t("qMedium")],
                  ["small", t("qSmall")],
                ]}
              />
              <ExportSelect
                label={t("pageSize")}
                value={layout === "id-card" ? "a4" : size}
                onChange={setSize}
                disabled={layout === "id-card"}
                options={[
                  ["fit", t("sizeFit")],
                  ["a4", t("sizeA4")],
                ]}
              />
              <ExportSelect
                label={t("layoutMode")}
                value={layout}
                onChange={setLayout}
                className="col-span-2 sm:col-span-1"
                options={[
                  ["standard", t("layoutStandard")],
                  ["id-card", t("layoutIdCard")],
                ]}
              />
            </div>
            <details className="rounded-lg border bg-background px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">
                {t("exportMoreOptions")}
              </summary>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <label className="inline-flex min-h-9 items-center gap-2">
                  <Switch
                    aria-label={t("pageNumbers")}
                    checked={pageNumbers}
                    onCheckedChange={setPageNumbers}
                  />
                  <span>{t("pageNumbers")}</span>
                </label>
                {layout === "standard" && (
                  <input
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    aria-label={t("watermarkLabel")}
                    placeholder={t("watermarkLabel")}
                    className="h-9 min-w-36 flex-1 rounded-md border bg-card px-3 text-sm"
                  />
                )}
              </div>
            </details>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <Button
                className="h-auto min-h-10 whitespace-normal px-2 sm:px-4"
                disabled={!!busy}
                onClick={() =>
                  run(t("processing"), async () => {
                    setPdf(
                      await exportPdf(
                        pages,
                        { quality, pageSize: size, layout, pageNumbers, watermarkText },
                        (a, b) => setBusy(`${t("processing")} ${a}/${b}`),
                      ),
                    );
                  })
                }
              >
                {t("buildPdf")}
              </Button>
              <Button
                variant="secondary"
                className="h-auto min-h-10 whitespace-normal px-2 sm:px-4"
                disabled={!!busy}
                onClick={() => void triggerSignHandoff()}
              >
                <FileSignature />
                {t("signThisPdf")}
              </Button>
            </div>
            {pdf && (
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <span className="me-auto text-sm font-medium text-success">
                  {t("pdfReady")} · {formatBytes(pdf.size)}
                </span>
                {!isNative() && (
                  <Button
                    variant="outline"
                    onClick={() => downloadBlob(pdf, safeFilename(doc.name))}
                  >
                    <Download />
                    {t("download")}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={async () => {
                    const fn = safeFilename(doc.name);
                    if (!canShareFile(pdf, fn)) {
                      toast.info(t("shareUnavailable"));
                      return;
                    }
                    try {
                      if ((await shareFile(pdf, fn)) === "shared") toast.success(t("shared"));
                    } catch {
                      toast.error(t("shareUnavailable"));
                    }
                  }}
                >
                  <Share2 />
                  {t("share")}
                </Button>
              </div>
            )}
          </section>
        )}
      </main>
      {editing && (
        <PageEditor
          key={editing.id}
          page={editing}
          onClose={() => setEditing(null)}
          onApplyAll={async (filter) => {
            await applyFilterToAllPages(doc.id, filter);
            await load();
          }}
          onSave={async (settings) => {
            const out = await renderOutputs(editing.original, settings);
            await putPage({ ...editing, ...out, settings });
            await load();
          }}
        />
      )}
    </div>
  );
}

function SortablePageCard({
  page: p,
  index: i,
  total,
  onEdit,
  onMove,
  onDuplicate,
  onReplace,
  onDelete,
}: {
  page: PageRecord;
  index: number;
  total: number;
  onEdit: () => void;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onReplace: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: p.id,
  });
  const numStr = String(i + 1).padStart(2, "0");
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`overflow-hidden rounded-lg border bg-card shadow-paper ${
        isDragging ? "z-10 opacity-60 ring-2 ring-primary" : ""
      }`}
    >
      <div className="relative">
        <Button variant="ghost"
          className="relative flex h-72 w-full items-center justify-center rounded-none bg-muted p-4 hover:bg-muted"
          onClick={onEdit}
          aria-label={`${t("edit")} ${i + 1}`}
        >
          <img src={p.thumb} alt="" className="max-h-full max-w-full rounded object-contain" />
          <span className="absolute start-2 top-2 rounded-md bg-primary px-2 py-0.5 font-mono text-xs font-bold text-primary-foreground shadow">
            {numStr}
          </span>
        </Button>
        <Button variant="ghost" size="icon"
          {...attributes}
          {...listeners}
          aria-label={`${t("dragToReorder")} ${i + 1}`}
          title={t("dragToReorder")}
          className="camera-tool absolute end-2 top-2 grid size-11 cursor-grab touch-none place-items-center rounded-md bg-stage/80 active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </Button>
      </div>
      <p
        className={`px-2.5 pt-1.5 text-[11px] font-medium ${
          p.autoDetected ? "text-success" : "text-warning"
        }`}
      >
        {p.autoDetected ? t("autoBadge") : t("manualBadge")}
      </p>
      <div className="flex flex-wrap justify-center p-1">
        <IconBtn label={t("edit")} onClick={onEdit}>
          <Pencil />
        </IconBtn>
        <IconBtn label={t("moveEarlier")} disabled={i === 0} onClick={() => onMove(-1)}>
          <ChevronUp />
        </IconBtn>
        <IconBtn label={t("moveLater")} disabled={i === total - 1} onClick={() => onMove(1)}>
          <ChevronDown />
        </IconBtn>
        <IconBtn label={t("duplicate")} onClick={onDuplicate}>
          <Copy />
        </IconBtn>
        <IconBtn label={t("replace")} onClick={onReplace}>
          <RefreshCw />
        </IconBtn>
        <IconBtn label={t("delete")} onClick={onDelete}>
          <Trash2 className="text-destructive" />
        </IconBtn>
      </div>
    </li>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-5xl space-y-3 px-4 py-10">{children}</main>
    </div>
  );
}

function IconBtn({
  label,
  children,
  ...rest
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button variant="ghost" size="icon" aria-label={label} title={label} {...rest}>
      {children}
    </Button>
  );
}

function ExportSelect<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled,
  className = "",
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: [T, string][];
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={`grid min-w-0 gap-1 text-sm ${className}`}>
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-10 min-w-0 w-full rounded-lg border bg-background px-2 font-medium focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
