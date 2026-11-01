export type DocumentSort = "newest" | "oldest" | "name";
export function filterDocuments<T extends { name: string; updatedAt: number }>(
  docs: T[], query: string, sort: DocumentSort, locale: string,
): T[] {
  const term = query.trim().toLocaleLowerCase(locale);
  return docs.filter((doc) => doc.name.toLocaleLowerCase(locale).includes(term)).sort((a, b) =>
    sort === "name" ? a.name.localeCompare(b.name, locale) :
    sort === "oldest" ? a.updatedAt - b.updatedAt : b.updatedAt - a.updatedAt,
  );
}
