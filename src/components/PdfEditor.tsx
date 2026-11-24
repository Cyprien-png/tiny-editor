import { type ReactNode, useEffect, useRef } from "react";
import type { Annotations } from "../lib/annotations";
import { useAnnotations } from "../lib/useAnnotations";
import { type PdfInfo, PdfReader } from "./PdfReader";

export interface PdfEditorProps {
  /** The PDF: its bytes, or an address to fetch it from. */
  source: string | ArrayBuffer;
  title?: ReactNode;
  /** The annotations the editor starts with. To load others later, give the editor another `key`. */
  initialAnnotations?: Annotations;
  /** Called after each change (a stroke, an undo…) with all the annotations, by page number. */
  onChange?: (annotations: Annotations) => void;
  /** Covers the whole window, with a close button; otherwise the editor sits in the page. */
  overlay?: boolean;
  onClose?: () => void;
  /** Buttons added to the header (save, export…). */
  actions?: ReactNode;
  /** A short text at the end of the toolbar (« Saved »…). */
  status?: ReactNode;
  onLoaded?: (info: PdfInfo) => void;
  initialPage?: number;
  /** Height classes of the editor when it is not an overlay. */
  className?: string;
}

/**
 * The editor in one component: a PDF with its tools, keeping the annotations and their undo history itself.
 * For more control (resetting the annotations, undoing from outside), use `PdfReader` with `useAnnotations`.
 */
export function PdfEditor({ source, title = "", initialAnnotations, onChange, status, ...reader }: PdfEditorProps) {
  const annotations = useAnnotations(initialAnnotations ?? {});
  const changed = useRef(onChange);
  changed.current = onChange;
  useEffect(() => {
    if (annotations.version > 0) changed.current?.(annotations.ops);
  }, [annotations.version, annotations.ops]);
  return <PdfReader source={source} title={title} edit={{ ...annotations, status }} {...reader} />;
}
