export type DocumentSort = "newest" | "oldest" | "name";
export function filterDocuments<
  T extends { name: string; updatedAt: number; category?: string | undefined; notes?: string | undefined },
>(docs: T[], query: string, sort: DocumentSort, locale: string, category = "all"): T[] {
  const term = query.trim().toLocaleLowerCase(locale);
  return docs
    .filter((doc) => {
      if (category !== "all" && doc.category !== category) return false;
      if (!term) return true;
      const inName = doc.name.toLocaleLowerCase(locale).includes(term);
      const inNotes = doc.notes ? doc.notes.toLocaleLowerCase(locale).includes(term) : false;
      return inName || inNotes;
    })
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, locale)
        : sort === "oldest"
          ? a.updatedAt - b.updatedAt
          : b.updatedAt - a.updatedAt,
    );
}
