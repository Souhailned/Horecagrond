/**
 * Canvas export utilities for the floor plan editor.
 */

/**
 * Capture the current Three.js canvas as a PNG data URL.
 * Call this from a component that has access to the canvas element.
 */
export function captureCanvasAsPng(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

/**
 * Download a data URL as a file.
 */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
