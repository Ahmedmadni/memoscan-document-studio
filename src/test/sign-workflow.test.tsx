import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { I18nProvider } from "@/lib/i18n";
import { SigningWorkspace } from "@/components/SigningWorkspace";
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
  vi.restoreAllMocks();
});
function setup(en = false) {
  if (en) localStorage.setItem("waraqah.lang", "en");
  render(
    <I18nProvider>
      <SigningWorkspace />
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
    expect(await screen.findByRole("button", { name: "example.pdf" })).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
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

it("smooths pointer samples, preserves the stroke endpoint, and supports dots", () => {
  const ctx = {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([20, 43, 85, 255]) })),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  const png = "data:image/png;base64,dGVzdA==";
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(png);
  setup(true);

  const canvas = screen.getByLabelText("Draw in the box");
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 384,
    height: 192,
  } as DOMRect);

  function send(
    type: string,
    x: number,
    y: number,
    samples: { clientX: number; clientY: number }[] = [],
  ) {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperties(event, {
      pointerId: { value: 1 },
      getCoalescedEvents: { value: () => samples },
    });
    fireEvent(canvas, event);
  }

  send("pointerdown", 10, 10);
  send("pointermove", 24, 28, [
    { clientX: 10.2, clientY: 10.1 },
    { clientX: 22, clientY: 16 },
    { clientX: 24, clientY: 28 },
  ]);
  send("pointerup", 26, 29);

  expect(ctx.quadraticCurveTo.mock.calls).toEqual([
    [30, 30, 48, 39],
    [66, 48, 69, 66],
    [72, 84, 75, 85.5],
  ]);
  expect(ctx.lineTo).toHaveBeenCalledExactlyOnceWith(78, 87);
  expect(screen.getByRole("img", { name: "Signature preview" })).toHaveAttribute("src", png);

  send("pointerdown", 30, 30);
  send("pointerup", 30, 30);
  expect(ctx.arc).toHaveBeenCalledExactlyOnceWith(90, 90, 5.25, 0, Math.PI * 2);
  send("pointerdown", 32, 32);
  send("pointercancel", 0, 0);
  expect(ctx.fill).toHaveBeenCalledOnce();
});
