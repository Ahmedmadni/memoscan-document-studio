import { describe, expect, it } from "vitest";
import { filterDocuments } from "@/lib/document-list";
const docs = [
  { name: "عقد", updatedAt: 20 },
  { name: "Invoice", updatedAt: 10 },
  { name: "Receipt", updatedAt: 30 },
];
describe("document library", () => {
  it("searches names without case sensitivity or surrounding spaces", () => {
    expect(filterDocuments(docs, " INVOICE ", "newest", "en")).toEqual([docs[1]]);
  });
  it("searches Arabic names", () => {
    expect(filterDocuments(docs, "عقد", "newest", "ar")).toEqual([docs[0]]);
  });
  it("sorts updates newest first without changing stored order", () => {
    expect(filterDocuments(docs, "", "newest", "en").map((d) => d.updatedAt)).toEqual([30, 20, 10]);
    expect(docs.map((d) => d.updatedAt)).toEqual([20, 10, 30]);
  });
  it("sorts updates oldest first", () => {
    expect(filterDocuments(docs, "", "oldest", "en").map((d) => d.updatedAt)).toEqual([10, 20, 30]);
  });
  it("sorts names alphabetically", () => {
    expect(filterDocuments(docs.slice(1), "", "name", "en").map((d) => d.name)).toEqual([
      "Invoice",
      "Receipt",
    ]);
  });
});
