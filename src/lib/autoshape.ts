/**
 * Automatic shapes of the PDF editor: a stroke drawn with the pen, then held still at its end, becomes the shape it
 * looks like (a straight line, a circle or an ellipse, a rectangle), which the pointer then adjusts until it lifts.
 * Pure geometry on the points of a stroke, in page-relative coordinates like the annotations.
 */

export interface Snap {
  t: "line" | "rect" | "ellipse";
  a: [number, number];
  b: [number, number];
}

type Point = [number, number];

/** How long the pointer stays still before the stroke becomes a shape, and how far it may tremble meanwhile (pixels). */
export const HOLD_MS = 500;
export const HOLD_SLOP = 5;

const MIN_LENGTH = 24;
const MIN_SIDE = 12;

/**
 * The shape a stroke looks like on a page of `W` × `H` pixels, or nothing when it looks like none.
 * A stroke that goes almost straight from its start to its end is a line. A stroke that comes back near its start is a
 * closed outline: what it fills of its bounding box tells a rectangle (nearly all of it) from an ellipse (π/4 of it);
 * an outline nearly as wide as high becomes a circle or a square.
 */
export function recognize(points: number[], W: number, H: number): Snap | undefined {
  const n = points.length / 2;
  if (n < 2) return undefined;
  const px = (i: number) => points[2 * i] * W;
  const py = (i: number) => points[2 * i + 1] * H;
  let length = 0;
  let [left, right, top, bottom] = [px(0), px(0), py(0), py(0)];
  for (let i = 1; i < n; i++) {
    length += Math.hypot(px(i) - px(i - 1), py(i) - py(i - 1));
    left = Math.min(left, px(i));
    right = Math.max(right, px(i));
    top = Math.min(top, py(i));
    bottom = Math.max(bottom, py(i));
  }
  if (length < MIN_LENGTH) return undefined;
  const [x1, y1, x2, y2] = [px(0), py(0), px(n - 1), py(n - 1)];
  const chord = Math.hypot(x2 - x1, y2 - y1);

  if (chord >= 0.8 * length) {
    let off = 0;
    for (let i = 1; i < n - 1; i++) off = Math.max(off, Math.abs((x2 - x1) * (y1 - py(i)) - (x1 - px(i)) * (y2 - y1)) / chord);
    if (off <= Math.max(6, 0.1 * chord)) return { t: "line", a: [points[0], points[1]], b: [points[2 * n - 2], points[2 * n - 1]] };
    return undefined;
  }

  let [w, h] = [right - left, bottom - top];
  if (w < MIN_SIDE || h < MIN_SIDE || chord > 0.3 * Math.hypot(w, h)) return undefined;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += px(i) * py(j) - px(j) * py(i);
  }
  const fill = Math.abs(area) / 2 / (w * h);
  const t = fill >= 0.87 ? "rect" : fill >= 0.62 ? "ellipse" : undefined;
  if (!t) return undefined;
  // Nearly as wide as high: a circle, a square.
  if (Math.abs(w - h) / Math.max(w, h) < (t === "ellipse" ? 0.2 : 0.12)) w = h = (w + h) / 2;
  const [cx, cy] = [(left + right) / 2, (top + bottom) / 2];
  return { t, a: [(cx - w / 2) / W, (cy - h / 2) / H], b: [(cx + w / 2) / W, (cy + h / 2) / H] };
}

/**
 * The shape while the pointer slides after the hold, from where it was held to where it is: a line follows it with its
 * end, as with the line tool; a circle, an ellipse or a rectangle grows or shrinks around its centre.
 */
export function adjust(snap: Snap, from: Point, to: Point, W: number, H: number): Snap {
  if (snap.t === "line") return { ...snap, b: to };
  const [cx, cy] = [(snap.a[0] + snap.b[0]) / 2, (snap.a[1] + snap.b[1]) / 2];
  const far = (p: Point) => Math.hypot((p[0] - cx) * W, (p[1] - cy) * H);
  const [hw, hh] = [((snap.b[0] - snap.a[0]) / 2) * W, ((snap.b[1] - snap.a[1]) / 2) * H];
  // Never smaller than a few pixels: a shape that vanished could not be grown back.
  const k = Math.max(far(to) / Math.max(far(from), 8), 4 / Math.min(hw, hh));
  return { ...snap, a: [cx - (hw * k) / W, cy - (hh * k) / H], b: [cx + (hw * k) / W, cy + (hh * k) / H] };
}

const STORE = "tiny-editor-autoshape";

export function loadAutoShape(): boolean {
  try {
    return localStorage.getItem(STORE) === "1";
  } catch {
    return false;
  }
}

export function saveAutoShape(on: boolean): void {
  try {
    localStorage.setItem(STORE, on ? "1" : "0");
  } catch {
    // Private browsing or storage full: the setting lasts as long as the page.
  }
}
