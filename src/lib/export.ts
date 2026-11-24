/**
 * Writes the annotations into the PDF itself: strokes and shapes as vector paths, texts as real text, on top of each
 * page, in the place they have on screen. The pages and what they contain are left as they are.
 */
import {
  type PDFFont,
  type PDFName,
  type PDFOperator,
  type PDFPage,
  LineCapStyle,
  LineJoinStyle,
  PDFDocument,
  StandardFonts,
  appendBezierCurve,
  beginText,
  closePath,
  concatTransformationMatrix,
  drawObject,
  endText,
  fill,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setFillingColor,
  setFontAndSize,
  setGraphicsState,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingColor,
  setTextMatrix,
  showText,
  stroke,
} from "pdf-lib";
import { type Annotations, type Op, type TextOp, HIGHLIGHT_ALPHA, TEXT_FONT, TEXT_LINE, isStroke, isText, textLines } from "./annotations";

/** The page as it is shown: its size, and the matrix that takes a point of it (x to the right, y down) to the PDF's own coordinates. */
export interface Frame {
  width: number;
  height: number;
  matrix: [number, number, number, number, number, number];
}

/**
 * The frame of a page from its visible box and its rotation, as pdf.js lays it out: the annotations are relative to
 * what is shown, a page turned by 90° is wider than high and its top left corner is the bottom left one of the PDF.
 */
export function pageFrame(box: { x: number; y: number; width: number; height: number }, rotation: number): Frame {
  const [x1, y1, x2, y2] = [box.x, box.y, box.x + box.width, box.y + box.height];
  switch ((((Math.round(rotation / 90) * 90) % 360) + 360) % 360) {
    case 90:
      return { width: box.height, height: box.width, matrix: [0, 1, 1, 0, x1, y1] };
    case 180:
      return { width: box.width, height: box.height, matrix: [-1, 0, 0, 1, x2, y1] };
    case 270:
      return { width: box.height, height: box.width, matrix: [0, -1, -1, 0, x2, y2] };
    default:
      return { width: box.width, height: box.height, matrix: [1, 0, 0, -1, x1, y2] };
  }
}

/** The part of the page that is shown: its crop box, within its media box. */
function visibleBox(page: PDFPage): { x: number; y: number; width: number; height: number } {
  const media = page.getMediaBox();
  const crop = page.getCropBox();
  const x = Math.max(media.x, crop.x);
  const y = Math.max(media.y, crop.y);
  const width = Math.min(media.x + media.width, crop.x + crop.width) - x;
  const height = Math.min(media.y + media.height, crop.y + crop.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : media;
}

function color(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255) : rgb(0, 0, 0);
}

const KAPPA = 0.5522847498;
/** Where the baseline of a line of text is under its top, in font sizes: what « top » means for the fonts of the screen. */
const ASCENT = 0.93;
/** Pixels per PDF unit of a text drawn as an image. */
const TEXT_IMAGE_SCALE = 4;

/** A text the standard font cannot write (another alphabet, an emoji, an arrow), drawn as the screen draws it. */
async function textImage(op: TextOp, W: number): Promise<{ png: Uint8Array; width: number; height: number } | undefined> {
  if (typeof document === "undefined") return undefined;
  const size = op.s * W;
  const lines = textLines(op);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  const font = `${size * TEXT_IMAGE_SCALE}px ${TEXT_FONT}`;
  ctx.font = font;
  const width = Math.max(...lines.map((line) => ctx.measureText(line).width), 1) / TEXT_IMAGE_SCALE + size;
  const height = lines.length * size * TEXT_LINE + size * 0.5;
  canvas.width = Math.ceil(width * TEXT_IMAGE_SCALE);
  canvas.height = Math.ceil(height * TEXT_IMAGE_SCALE);
  ctx.font = font;
  ctx.fillStyle = op.c;
  ctx.textBaseline = "top";
  lines.forEach((line, i) => ctx.fillText(line, 0, i * size * TEXT_LINE * TEXT_IMAGE_SCALE));
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return undefined;
  return { png: new Uint8Array(await blob.arrayBuffer()), width: canvas.width / TEXT_IMAGE_SCALE, height: canvas.height / TEXT_IMAGE_SCALE };
}

/** What the standard font can write of a line, the rest replaced: the last resort where no canvas can draw the text. */
function writable(font: PDFFont, line: string): string {
  return [...line].map((char) => (canWrite(font, char) ? char : "?")).join("");
}

function canWrite(font: PDFFont, text: string): boolean {
  try {
    font.encodeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The operators that draw the annotations of one page, in the coordinates of its frame (points, y down). */
async function pageOperators(doc: PDFDocument, page: PDFPage, ops: Op[], frame: Frame, font: PDFFont): Promise<PDFOperator[]> {
  const { width: W, height: H } = frame;
  const out: PDFOperator[] = [pushGraphicsState(), concatTransformationMatrix(...frame.matrix), setLineCap(LineCapStyle.Round), setLineJoin(LineJoinStyle.Round)];
  let fontKey: PDFName | undefined;
  let highlight: PDFName | undefined;

  for (const op of ops) {
    out.push(pushGraphicsState(), setStrokingColor(color(op.c)), setFillingColor(color(op.c)));
    if (isText(op)) {
      const size = op.s * W;
      const lines = textLines(op);
      const image = lines.every((line) => canWrite(font, line)) ? undefined : await textImage(op, W);
      if (image) {
        const key = page.node.newXObject("TinyEditorText", (await doc.embedPng(image.png)).ref);
        // An image fills the unit square, upwards: flipped back, since y goes down here.
        out.push(concatTransformationMatrix(image.width, 0, 0, -image.height, op.x * W, op.y * H + image.height), drawObject(key));
      } else {
        fontKey ??= page.node.newFontDictionary(font.name, font.ref);
        out.push(beginText(), setFontAndSize(fontKey, size));
        lines.forEach((line, i) => out.push(setTextMatrix(1, 0, 0, -1, op.x * W, op.y * H + (i * TEXT_LINE + ASCENT) * size), showText(font.encodeText(writable(font, line)))));
        out.push(endText());
      }
    } else if (isStroke(op)) {
      const p = op.p;
      const x = (i: number) => p[i] * W;
      const y = (i: number) => p[i + 1] * H;
      if (op.t === "hl") {
        highlight ??= page.node.newExtGState("TinyEditorHighlight", doc.context.obj({ Type: "ExtGState", CA: HIGHLIGHT_ALPHA, ca: HIGHLIGHT_ALPHA }));
        out.push(setGraphicsState(highlight));
      }
      if (p.length === 2) out.push(...circle(x(0), y(0), Math.max(op.w * W, 1) / 2, Math.max(op.w * W, 1) / 2), fill());
      else if (p.length >= 4) {
        out.push(setLineWidth(op.w * W), moveTo(x(0), y(0)));
        // The same curve as on screen: a quadratic one through the middle of each segment, written as the cubic one it equals.
        let [fromX, fromY] = [x(0), y(0)];
        for (let i = 2; i < p.length - 2; i += 2) {
          const [toX, toY] = [(x(i) + x(i + 2)) / 2, (y(i) + y(i + 2)) / 2];
          out.push(appendBezierCurve(fromX + (2 / 3) * (x(i) - fromX), fromY + (2 / 3) * (y(i) - fromY), toX + (2 / 3) * (x(i) - toX), toY + (2 / 3) * (y(i) - toY), toX, toY));
          [fromX, fromY] = [toX, toY];
        }
        out.push(lineTo(x(p.length - 2), y(p.length - 2)), stroke());
      }
    } else {
      const [x1, y1, x2, y2] = [op.a[0] * W, op.a[1] * H, op.b[0] * W, op.b[1] * H];
      out.push(setLineWidth(op.w * W));
      if (op.t === "rect") out.push(moveTo(x1, y1), lineTo(x2, y1), lineTo(x2, y2), lineTo(x1, y2), closePath());
      else if (op.t === "ellipse") out.push(...circle((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2));
      else {
        out.push(moveTo(x1, y1), lineTo(x2, y2));
        if (op.t === "arrow") {
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const head = Math.max(op.w * W * 4, 0.018 * W);
          for (const side of [-1, 1]) out.push(moveTo(x2, y2), lineTo(x2 - head * Math.cos(angle + (side * Math.PI) / 7), y2 - head * Math.sin(angle + (side * Math.PI) / 7)));
        }
      }
      out.push(stroke());
    }
    out.push(popGraphicsState());
  }
  out.push(popGraphicsState());
  return out;
}

/** The closed path of an ellipse, as four curves. */
function circle(cx: number, cy: number, rx: number, ry: number): PDFOperator[] {
  const [kx, ky] = [rx * KAPPA, ry * KAPPA];
  return [
    moveTo(cx + rx, cy),
    appendBezierCurve(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry),
    appendBezierCurve(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy),
    appendBezierCurve(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry),
    appendBezierCurve(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy),
    closePath(),
  ];
}

/** Thrown for a PDF whose owner forbids changing it: it can be read, not written back. */
export class ProtectedPdfError extends Error {
  constructor() {
    super("Ce PDF est protégé : il ne peut pas être enregistré avec des annotations.");
    this.name = "ProtectedPdfError";
  }
}

/** The PDF with its annotations (by page number, from 1) written on its pages. */
export async function exportPdf(bytes: ArrayBuffer | Uint8Array, annotations: Annotations): Promise<Uint8Array> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (error) {
    if (error instanceof Error && /encrypted/i.test(error.message)) throw new ProtectedPdfError();
    throw error;
  }
  const pages = doc.getPages();
  let font: PDFFont | undefined;
  for (const [number, ops] of Object.entries(annotations)) {
    const page = pages[Number(number) - 1];
    if (!page || ops.length === 0) continue;
    font ??= await doc.embedFont(StandardFonts.Helvetica);
    page.pushOperators(...(await pageOperators(doc, page, ops, pageFrame(visibleBox(page), page.getRotation().angle), font)));
  }
  return doc.save();
}
