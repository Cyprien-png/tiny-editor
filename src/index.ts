/**
 * The library: the PDF editor as React components.
 *
 *   import { PdfEditor, exportPdf } from "tiny-editor";
 *   import "tiny-editor/style.css";
 */
import "./styles.css";

export { PdfEditor, type PdfEditorProps } from "./components/PdfEditor";
export { PdfReader, type PdfInfo } from "./components/PdfReader";
export { ShortcutSettings } from "./components/ShortcutSettings";
export { useAnnotations, type AnnotationsApi } from "./lib/useAnnotations";
export { type Annotations, type Op, type Shape, type ShapeKind, type Stroke, type TextOp, COLORS, STROKES, TEXT_SIZES, countAnnotated, drawOp, drawOps } from "./lib/annotations";
export { type Binding, type Mode, type Tool, type Trigger, DEFAULT_BINDINGS, loadBindings, saveBindings } from "./lib/shortcuts";
export { loadAutoShape, saveAutoShape } from "./lib/autoshape";
export { type PdfConfig, configurePdf, openPdf, renderPageImage } from "./lib/pdf";
import type { Annotations } from "./lib/annotations";

/** The PDF with its annotations written on its pages (loaded when first called: writing a PDF is a library of its own). */
export async function exportPdf(bytes: ArrayBuffer | Uint8Array, annotations: Annotations): Promise<Uint8Array> {
  return (await import("./lib/export")).exportPdf(bytes, annotations);
}
