import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FileText, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { PageHeading } from "@/components/PageHeading";
import { filterDocuments, type DocumentSort } from "@/lib/document-list";
import { Button } from "@/components/ui/button";
import {
  createDoc,
  deleteDoc,
  getPage,
  listDocs,
  requestPersistence,
  type DocRecord,
} from "@/lib/db";
import { defaultDocName } from "@/lib/docOps";
import { errorKey } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "My documents — Waraqah" },
      {
        name: "description",
        content: "Browse and organize your locally stored Waraqah documents.",
      },
      { property: "og:title", content: "My documents — Waraqah" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        property: "og:description",
        content: "Search and sort private documents stored only on your device.",
      },
    ],
  }),
  component: DocumentsPage,
});

type DocWithThumb = DocRecord & { thumb?: string | undefined };

function DocumentsPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocWithThumb[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<DocumentSort>("newest");
  const visibleDocs = useMemo(
    () => filterDocuments(docs ?? [], query, sort, lang),
    [docs, query, sort, lang],
  );

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
      setError(null);
    } catch (e) {
      setError(t(errorKey(e)));
    }
  }, [t]);

  useEffect(() => {
    void load();
    void requestPersistence();
  }, [load]);

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
        <PageHeading
          title={t("myDocs")}
          action={
            <Button onClick={newEmpty}>
              <Plus />
              {t("newDoc")}
            </Button>
          }
        >
          <span className="inline-flex items-center gap-2">
            {t("localBadge")}
            {docs && <span className="text-primary">· {docs.length}</span>}
          </span>
        </PageHeading>
        <div className="mb-6 flex flex-wrap gap-3">
          <div className="relative min-w-0 flex-1 basis-48">
            <Search className="pointer-events-none absolute start-3 top-3 size-4 text-muted-foreground" />
            <input
              aria-label={t("searchDocs")}
              placeholder={t("searchDocs")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 w-full rounded-md border bg-card pe-3 ps-10 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <select
            aria-label={t("sortDocs")}
            value={sort}
            onChange={(e) => {
              const value = e.target.value;
              if (value === "newest" || value === "oldest" || value === "name") setSort(value);
            }}
            className="h-10 max-w-full rounded-md border bg-card px-3 text-sm"
          >
            <option value="newest">{t("sortNewest")}</option>
            <option value="oldest">{t("sortOldest")}</option>
            <option value="name">{t("sortName")}</option>
          </select>
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
          <div className="py-16 text-center">
            <FileText className="mx-auto size-10 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold">{t("emptyTitle")}</h2>
            <Button className="mt-5" asChild>
              <Link to="/scan">
                <Plus />
                {t("scanDocuments")}
              </Link>
            </Button>
          </div>
        )}
        {!!docs?.length && visibleDocs.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-muted-foreground">{t("noResults")}</p>
            <Button variant="ghost" className="mt-3" onClick={() => setQuery("")}>
              {t("clearSearch")}
            </Button>
          </div>
        )}
        {!!docs?.length && (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {visibleDocs.map((d) => (
              <li
                key={d.id}
                className="group overflow-hidden rounded-lg border bg-card shadow-paper"
              >
                <Link to="/doc/$id" params={{ id: d.id }} className="block" aria-label={d.name}>
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