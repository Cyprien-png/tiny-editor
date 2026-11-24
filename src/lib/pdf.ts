import type { PDFDocumentProxy } from "pdfjs-dist";
import { defaultAssetsUrl, startWorker } from "#platform";
import { drawOps, type Op } from "./annotations";

export interface PdfConfig {
  /**
   * Where the files pdf.js loads at run time are published (the pdfjs/ folder: cmaps/, standard_fonts/, wasm/, iccs/),
   * as an absolute address ending with a slash. Without it most PDFs still open; those using fonts they do not embed,
   * some Asian encodings or JPEG 2000 images are drawn incompletely.
   */
  assetsUrl?: string;
  /** The address of pdf.js's worker, instead of the one that comes with the editor. */
  workerSrc?: string;
}

let config: PdfConfig = {};
let library: Promise<typeof import("pdfjs-dist")> | undefined;

/** Settings of pdf.js, to give before the first PDF opens. */
export function configurePdf(next: PdfConfig): void {
  config = { ...config, ...next };
}

/** pdf.js, loaded the first time a PDF is opened (it is large), with its worker. */
export function pdfjs(): Promise<typeof import("pdfjs-dist")> {
  library ??= (async () => {
    const lib = await import("pdfjs-dist");
    if (config.workerSrc) lib.GlobalWorkerOptions.workerSrc = config.workerSrc;
    else await startWorker(lib);
    return lib;
  })();
  return library;
}

/** Opens a PDF from its bytes (the buffer is copied: pdf.js takes ownership of what it receives). */
export async function openPdf(bytes: ArrayBuffer): Promise<PDFDocumentProxy> {
  const lib = await pdfjs();
  const assets = config.assetsUrl ?? defaultAssetsUrl();
  return lib.getDocument({
    data: new Uint8Array(bytes.slice(0)),
    ...(assets ? { cMapUrl: `${assets}cmaps/`, cMapPacked: true, standardFontDataUrl: `${assets}standard_fonts/`, wasmUrl: `${assets}wasm/`, iccUrl: `${assets}iccs/` } : {}),
  }).promise;
}

/** Pixels above which a canvas is refused or very slow on phones. */
export const MAX_CANVAS_PIXELS = 12_000_000;

/** A page with its annotations as a JPEG, `width` pixels wide. */
export async function renderPageImage(pdf: PDFDocumentProxy, pageNumber: number, ops: Op[], width = 1700): Promise<Blob> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  let scale = width / base.width;
  if (base.width * scale * base.height * scale > MAX_CANVAS_PIXELS) scale = Math.sqrt(MAX_CANVAS_PIXELS / (base.width * base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  await page.render({ canvas, canvasContext: ctx, viewport, background: "#ffffff" }).promise;
  drawOps(ctx, ops, canvas.width, canvas.height);
  page.cleanup();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error("Impossible de produire l'image de la page");
  return blob;
}
