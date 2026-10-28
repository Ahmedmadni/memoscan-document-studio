import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Loader2,
  Pencil,
  RefreshCw,
  Share2,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { ImagePickers } from "@/components/ImagePickers";
import { PageEditor } from "@/components/PageEditor";
import { Button } from "@/components/ui/button";
import {
  deletePage,
  getDoc,
  getPages,
  putDoc,
  putPage,
  uid,
  type DocRecord,
  type PageRecord,
} from "@/lib/db";
import { addFilesToDoc, insertAfter, movePage, reinsertAt, removeId } from "@/lib/docOps";
import { errorKey } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { buildPage, renderOutputs } from "@/lib/pages";
import {
  canShareFile,
  downloadBlob,
  exportPdf,
  formatBytes,
  safeFilename,
  shareFile,
  type PdfPageSize,
  type PdfQuality,
} from "@/lib/pdf";

export const Route = createFileRoute("/doc/$id")({
  head: () => ({
    meta: [
      { title: "Document — MemoScan" },
      {
        name: "description",
        content: "Edit pages, fix perspective and export a PDF on your device.",
      },
      { property: "og:title", content: "Document — MemoScan" },
      { property: "og:description", content: "On-device scan editing and PDF export." },
    ],
  }),
  component: DocPage,
});

function DocPage() {
  const { id } = Route.useParams();
  const { t } = useI18n();
  const [doc, setDoc] = useState<DocRecord | null | undefined>(undefined);
  const [pages, setPages] = useState<PageRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<PageRecord | null>(null);
  const [quality, setQuality] = useState<PdfQuality>("medium");
  const [size, setSize] = useState<PdfPageSize>("fit");
  const [pdf, setPdf] = useState<Blob | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await getDoc(id);
      setDoc(d ?? null);
      if (d) setPages(await getPages(d));
    } catch (e) {
      toast.error(t(errorKey(e)));
      setDoc(null);
    }
  }, [id, t]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => setPdf(null), [pages, quality, size]);

  async function saveOrder(ids: string[], d = doc!) {
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
        <Link to="/" className="text-primary underline">
          {t("back")}
        </Link>
      </Shell>
    );

  const ids = doc.pageIds;
  const move = (i: number, d: number) => void run("", () => saveOrder(movePage(ids, i, d)));

  return (
    <div className="min-h-screen">
      <AppHeader
        start={
          <Link
            to="/"
            aria-label={t("back")}
            className="grid size-9 place-items-center rounded-md hover:bg-muted"
          >
            <ArrowLeft className="size-5 rtl:rotate-180" />
          </Link>
        }
      />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 pb-20">
        <input
          aria-label={t("docName")}
          defaultValue={doc.name}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== doc.name) void run("", () => saveOrder(ids, { ...doc, name }));
          }}
          className="w-full rounded-lg border-0 bg-transparent font-display text-2xl font-semibold outline-none focus:ring-2 focus:ring-ring"
        />
        <ImagePickers
          size="default"
          disabled={!!busy}
          onFiles={(files) =>
            run(t("processing"), async () => {
              const r = await addFilesToDoc(doc.id, files, (a, b) =>
                setBusy(`${t("processing")} ${a}/${b}`),
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
          <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            {t("noPages")}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {pages.map((p, i) => (
              <li key={p.id} className="overflow-hidden rounded-xl border bg-card shadow-paper">
                <button
                  className="relative block aspect-[3/4] w-full bg-muted"
                  onClick={() => setEditing(p)}
                  aria-label={`${t("edit")} ${i + 1}`}
                >
                  <img src={p.thumb} alt="" className="size-full object-contain" />
                  <span className="absolute start-2 top-2 rounded-md bg-stage px-2 text-xs text-stage-foreground">
                    {i + 1}
                  </span>
                </button>
                <p
                  className={`px-2 pt-1 text-[11px] ${p.autoDetected ? "text-success" : "text-warning"}`}
                >
                  {p.autoDetected ? t("autoBadge") : t("manualBadge")}
                </p>
                <div className="flex flex-wrap justify-center p-1">
                  <IconBtn label={t("edit")} onClick={() => setEditing(p)}>
                    <Pencil />
                  </IconBtn>
                  <IconBtn label={t("moveEarlier")} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ChevronUp />
                  </IconBtn>
                  <IconBtn
                    label={t("moveLater")}
                    disabled={i === pages.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ChevronDown />
                  </IconBtn>
                  <IconBtn
                    label={t("duplicate")}
                    onClick={() =>
                      run("", async () => {
                        const copy = { ...p, id: uid(), createdAt: Date.now() };
                        await putPage(copy);
                        await saveOrder(insertAfter(ids, i, copy.id));
                      })
                    }
                  >
                    <Copy />
                  </IconBtn>
                  <IconBtn
                    label={t("replace")}
                    onClick={() => {
                      replaceTarget.current = p.id;
                      replaceInput.current?.click();
                    }}
                  >
                    <RefreshCw />
                  </IconBtn>
                  <IconBtn
                    label={t("delete")}
                    onClick={() => {
                      // Soft delete: the page leaves the order now; its record is erased only
                      // when the toast ends without an undo. Pending deletes are tracked by id
                      // so undo re-inserts at the original index in the *current* order and
                      // each toast finalizes at most once.
                      const index = i;
                      void run("", async () => {
                        pendingDeletes.current.set(p.id, index);
                        await saveOrder(removeId(ids, p.id));
                        const finalize = () => {
                          if (pendingDeletes.current.delete(p.id)) void deletePage(p.id);
                        };
                        toast(t("pageDeleted"), {
                          duration: 6000,
                          action: {
                            label: t("undo"),
                            onClick: () => {
                              if (!pendingDeletes.current.delete(p.id)) return;
                              void run("", async () => {
                                const fresh = await getDoc(doc.id);
                                if (fresh) await saveOrder(reinsertAt(fresh.pageIds, index, p.id), fresh);
                              });
                            },
                          },
                          onAutoClose: finalize,
                          onDismiss: finalize,
                        });
                      });
                    }}
                  >
                    <Trash2 className="text-destructive" />
                  </IconBtn>
                </div>
              </li>
            ))}
          </ul>
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
          <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-paper">
            <h2 className="text-lg font-semibold">{t("exportTitle")}</h2>
            <Choice
              label={t("quality")}
              value={quality}
              onChange={setQuality}
              options={[
                ["high", t("qHigh")],
                ["medium", t("qMedium")],
                ["small", t("qSmall")],
              ]}
            />
            <Choice
              label={t("pageSize")}
              value={size}
              onChange={setSize}
              options={[
                ["fit", t("sizeFit")],
                ["a4", t("sizeA4")],
              ]}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={!!busy}
                onClick={() =>
                  run(t("processing"), async () => {
                    setPdf(
                      await exportPdf(pages, { quality, pageSize: size }, (a, b) =>
                        setBusy(`${t("processing")} ${a}/${b}`),
                      ),
                    );
                  })
                }
              >
                {t("buildPdf")}
              </Button>
              {pdf && (
                <>
                  <span className="text-sm text-success">
                    {t("pdfReady")} · {formatBytes(pdf.size)}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => downloadBlob(pdf, safeFilename(doc.name))}
                  >
                    <Download />
                    {t("download")}
                  </Button>
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
                </>
              )}
            </div>
          </section>
        )}
      </main>
      {editing && (
        <PageEditor
          page={editing}
          onClose={() => setEditing(null)}
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

function Choice<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-24 text-muted-foreground">{label}</span>
      {options.map(([v, l]) => (
        <button key={v} className="chip" aria-pressed={value === v} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}
