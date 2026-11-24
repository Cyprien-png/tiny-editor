import type * as Pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/**
 * How the standalone application gives pdf.js its worker and its files: both are published with the application.
 * Absolute: pdf.js fetches them from its worker, where a relative address would start from the worker's own folder.
 */
export const defaultAssetsUrl = (): string | undefined => new URL("pdfjs/", document.baseURI).href;

export async function startWorker(lib: typeof Pdfjs): Promise<void> {
  lib.GlobalWorkerOptions.workerSrc = workerUrl;
}
