import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FileSignature, FileText, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { ImagePickers } from "@/components/ImagePickers";
import { Button } from "@/components/ui/button";
import {
  createDoc,
  deleteDoc,
  getPage,
  listDocs,
  requestPersistence,
  type DocRecord,
} from "@/lib/db";
import { addFilesToDoc, defaultDocName } from "@/lib/docOps";
import { errorKey } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Waraqah — ورقة | Scan and sign documents" },
      {
        name: "description",
        content:
          "Scan, straighten and enhance documents into multi-page PDFs — fully on your device.",
      },
      { property: "og:title", content: "Waraqah — ورقة" },
      {
        property: "og:description",
        content: "Private document workspace for scanning pages and signing PDFs on-device.",
      },
    ],
  }),
  component: Home,
});

type DocWithThumb = DocRecord & { thumb?: string | undefined };

function Home() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocWithThumb[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await listDocs();
      const withThumbs = await Promise.all(
        list.map(async (d) => ({
          ...d,
          thumb: d.pageIds[0] ? (await getPage(d.pageIds[0]))?.thumb : undefined,
        })),
      );
      setDocs(withThumbs);
    } catch (e) {
      setError(t(errorKey(e)));
    }
  }, [t]);

  useEffect(() => {
    void load();
    void requestPersistence();
  }, [load]);

  async function startWith(files: File[]) {
    try {
      const doc = await createDoc(defaultDocName(t("untitled"), lang));
      setBusy({ done: 0, total: files.length });
      const r = await addFilesToDoc(doc.id, files, (done, total) => setBusy({ done, total }));
      if (r.failed) toast.error(t(errorKey(r.firstError)));
      navigate({ to: "/doc/$id", params: { id: doc.id } });
    } catch (e) {
      toast.error(t(errorKey(e)));
    } finally {
      setBusy(null);
    }
  }

  async function newEmpty() {
    try {
      const doc = await createDoc(defaultDocName(t("untitled"), lang));
      navigate({ to: "/doc/$id", params: { id: doc.id } });
    } catch (e) {
      toast.error(t(errorKey(e)));
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t("confirmDeleteDoc"))) return;
    try {
      await deleteDoc(id);
      await load();
    } catch (e) {
      toast.error(t(errorKey(e)));
    }
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 pb-16">
        <section className="paper-grid -mx-4 mb-8 border-b px-4 py-10">
          <h1 className="max-w-xl text-3xl font-bold leading-tight sm:text-4xl">{t("appName")}</h1>
          <p className="mt-2 max-w-xl text-muted-foreground">{t("tagline")}</p>
          <div className="mt-6">
            <ImagePickers onFiles={startWith} disabled={!!busy} />
          </div>
          {busy && (
            <p className="mt-4 flex items-center gap-2 text-sm text-primary" role="status">
              <Loader2 className="size-4 animate-spin" /> {t("processing")} {busy.done}/{busy.total}
            </p>
          )}
          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-success" /> {t("privacyShort")}
          </p>
        </section>

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{t("myDocs")}</h2>
          <Button variant="ghost" size="sm" onClick={newEmpty}>
            <Plus /> {t("newDoc")}
          </Button>
        </div>

        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive">
            {error}
          </p>
        )}
        {!error && docs === null && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {t("loading")}
          </p>
        )}
        {docs?.length === 0 && (
          <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
            <FileText className="mx-auto size-10 text-muted-foreground" />
            <h3 className="mt-3 text-lg font-semibold">{t("emptyTitle")}</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{t("emptyBody")}</p>
            <ol className="mx-auto mt-6 grid max-w-2xl gap-3 text-start sm:grid-cols-3">
              {(["step1", "step2", "step3"] as const).map((k, i) => (
                <li key={k} className="flex items-start gap-3 rounded-xl bg-muted p-3 text-sm">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent font-semibold text-accent-foreground">
                    {i + 1}
                  </span>
                  {t(k)}
                </li>
              ))}
            </ol>
          </div>
        )}
        {!!docs?.length && (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {docs.map((d) => (
              <li
                key={d.id}
                className="group overflow-hidden rounded-xl border bg-card shadow-paper"
              >
                <Link to="/doc/$id" params={{ id: d.id }} className="block">
                  <div className="aspect-[3/4] bg-muted">
                    {d.thumb ? (
                      <img src={d.thumb} alt="" className="size-full object-cover" />
                    ) : (
                      <div className="grid size-full place-items-center text-muted-foreground">
                        <FileText className="size-8" />
                      </div>
                    )}
                  </div>
                </Link>
                <div className="flex items-start gap-1 p-3">
                  <Link to="/doc/$id" params={{ id: d.id }} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.pageIds.length} {t("pages")} ·{" "}
                      {new Date(d.updatedAt).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB")}
                    </p>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("delete")}
                    onClick={() => remove(d.id)}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
