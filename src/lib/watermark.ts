/** Canvas shapes Arabic using the same local font fallback as the preview. */
export function renderWatermarkPng(text: string, opacity = 1): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 600;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((-28 * Math.PI) / 180);
    ctx.globalAlpha = opacity;
    ctx.font = '700 64px "IBM Plex Sans Arabic", system-ui, sans-serif';
    ctx.fillStyle = "#475569";
    ctx.direction = /[\u0590-\u08ff]/.test(text) ? "rtl" : "ltr";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text.trim().slice(0, 48), 0, 0, 960);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
