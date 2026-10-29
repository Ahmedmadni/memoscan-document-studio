import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { I18nProvider } from "@/lib/i18n";
import { SignPage } from "@/routes/sign";
vi.mock("@/components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/lib/signature-preview", () => ({
  renderSigningPage: vi.fn(async (_b, _i, canvas) => {
    canvas.width = 600;
    canvas.height = 800;
  }),
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
});
function setup(en = false) {
  if (en) localStorage.setItem("waraqah.lang", "en");
  render(
    <I18nProvider>
      <SignPage />
    </I18nProvider>,
  );
}
async function uploadPdf(label: string) {
  const pdf = await PDFDocument.create();
  pdf.addPage([600, 800]);
  const bytes = await pdf.save();
  const file = new File([bytes as BlobPart], "example.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => bytes.buffer });
  fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } });
}
describe("signing UI states", () => {
  it.each([false, true])(
    "renders bilingual labels and blank export restriction (English=%s)",
    async (en) => {
      setup(en);
      const label = en ? "Choose PDF" : "اختيار ملف PDF";
      await uploadPdf(label);
      expect(screen.getByRole("status")).toHaveTextContent(en ? "Loading" : "جارٍ");
      await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
      expect(
        screen.getByRole("button", { name: en ? "Export signed PDF" : "تصدير PDF الموقّع" }),
      ).toBeDisabled();
      expect(document.documentElement.dir).toBe(en ? "ltr" : "rtl");
    },
  );
  it("shows recoverable invalid-PDF error then successfully opens another PDF", async () => {
    setup(true);
    const file = new File(["bad"], "bad.pdf");
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    fireEvent.change(screen.getByLabelText("Choose PDF"), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t open"));
    await uploadPdf("Choose PDF");
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByRole("button", { name: "example.pdf" })).toBeEnabled();
  });
  it("ignores cancelled imports and rejects unsupported images", async () => {
    setup(true);
    fireEvent.change(screen.getByLabelText("Choose PDF"), { target: { files: [] } });
    fireEvent.change(screen.getByLabelText("Import from photos"), { target: { files: [] } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.change(screen.getByLabelText("Import from photos"), {
      target: { files: [new File(["svg"], "s.svg", { type: "image/svg+xml" })] },
    });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("PNG or JPG"));
    expect(screen.getByRole("button", { name: "Choose PDF" })).toBeEnabled();
  });
});
