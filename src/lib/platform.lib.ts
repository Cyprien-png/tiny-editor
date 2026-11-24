import type * as Pdfjs from "pdfjs-dist";

/**
 * How the library gives pdf.js its worker: carried inside the library, so that the host has nothing to publish for a
 * PDF to open. The fonts and decoders (the pdfjs/ folder of the package) are only used once the host publishes them
 * and gives their address to `configurePdf`.
 */
export const defaultAssetsUrl = (): string | undefined => undefined;

export async function startWorker(lib: typeof Pdfjs): Promise<void> {
  // Loaded with pdf.js, when the first PDF opens: it is more than a megabyte.
  const { default: PdfWorker } = await import("pdfjs-dist/build/pdf.worker.min.mjs?worker&inline");
  lib.GlobalWorkerOptions.workerPort = new PdfWorker();
}
