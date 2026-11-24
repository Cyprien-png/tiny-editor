import assert from "node:assert/strict";
import { test } from "node:test";
import { adjust, recognize } from "../src/lib/autoshape.js";

const W = 800;
const H = 1000;
/** Points given in pixels, as the flat page-relative list of a stroke, with a tremble of `noise` pixels. */
const stroke = (pixels: [number, number][], noise = 0): number[] => pixels.flatMap(([x, y], i) => [(x + noise * Math.sin(i * 1.7)) / W, (y + noise * Math.cos(i * 2.3)) / H]);
const oval = (cx: number, cy: number, rx: number, ry: number, turns = 1): [number, number][] =>
  Array.from({ length: 60 }, (_, i) => {
    const a = (i / 59) * turns * 2 * Math.PI;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
const along = (corners: [number, number][], per = 12): [number, number][] =>
  corners.slice(1).flatMap((to, k) => Array.from({ length: per }, (_, i) => [corners[k][0] + ((to[0] - corners[k][0]) * i) / per, corners[k][1] + ((to[1] - corners[k][1]) * i) / per] as [number, number]));
const px = (s: { a: [number, number]; b: [number, number] }) => [s.a[0] * W, s.a[1] * H, s.b[0] * W, s.b[1] * H].map(Math.round);

test("a nearly straight stroke becomes the line between its ends", () => {
  const line = recognize(stroke(Array.from({ length: 30 }, (_, i) => [100 + i * 10, 200 + i * 4] as [number, number]), 2), W, H);
  assert.equal(line?.t, "line");
  const [x1, , x2] = px(line!);
  assert.ok(Math.abs(x1 - 100) <= 3 && Math.abs(x2 - 390) <= 3);
  // A curve, an angle and a dot are not lines.
  assert.equal(recognize(stroke(oval(300, 300, 100, 100, 0.5)), W, H), undefined);
  assert.equal(recognize(stroke(along([[100, 100], [300, 100], [300, 300]])), W, H), undefined);
  assert.equal(recognize(stroke([[100, 100], [103, 101], [104, 104]]), W, H), undefined);
});

test("a round outline becomes a circle, a flat one an ellipse", () => {
  // Drawn a little flat, with a tremble and a small overshoot: a true circle.
  const circle = recognize(stroke(oval(300, 400, 100, 90, 1.05), 3), W, H);
  assert.equal(circle?.t, "ellipse");
  const [l, t, r, b] = px(circle!);
  assert.ok(Math.abs(r - l - (b - t)) <= 1, "as wide as high");
  assert.ok(Math.abs((l + r) / 2 - 300) <= 4 && Math.abs((t + b) / 2 - 400) <= 4);
  const ellipse = recognize(stroke(oval(300, 400, 160, 60), 2), W, H);
  assert.equal(ellipse?.t, "ellipse");
  const [el, et, er, eb] = px(ellipse!);
  assert.ok(er - el > 2 * (eb - et));
  // An outline left wide open is not one.
  assert.equal(recognize(stroke(oval(300, 400, 100, 100, 0.7)), W, H), undefined);
});

test("a boxy outline becomes a rectangle, a triangle nothing", () => {
  const rect = recognize(stroke(along([[100, 100], [400, 104], [396, 300], [102, 296], [100, 106]]), 2), W, H);
  assert.equal(rect?.t, "rect");
  const [l, t, r, b] = px(rect!);
  assert.ok(Math.abs(l - 100) <= 6 && Math.abs(r - 400) <= 6 && Math.abs(t - 100) <= 6 && Math.abs(b - 300) <= 6);
  const square = recognize(stroke(along([[100, 100], [300, 100], [300, 290], [100, 290], [100, 100]])), W, H);
  const [sl, st, sr, sb] = px(square!);
  assert.ok(Math.abs(sr - sl - (sb - st)) <= 1);
  assert.equal(recognize(stroke(along([[100, 300], [250, 100], [400, 300], [100, 300]])), W, H), undefined);
});

test("sliding after the hold moves the end of a line and resizes the other shapes around their centre", () => {
  const line = adjust({ t: "line", a: [0.1, 0.1], b: [0.5, 0.2] }, [0.5, 0.2], [0.6, 0.4], W, H);
  assert.deepEqual(line, { t: "line", a: [0.1, 0.1], b: [0.6, 0.4] });

  // A circle of radius 100 px around (400, 500), held on its right edge, slid to twice as far.
  const circle = { t: "ellipse" as const, a: [300 / W, 400 / H] as [number, number], b: [500 / W, 600 / H] as [number, number] };
  assert.deepEqual(px(adjust(circle, [500 / W, 500 / H], [600 / W, 500 / H], W, H)), [200, 300, 600, 700]);
  // Not moving changes nothing; sliding to the centre leaves a small shape, never an empty one.
  assert.deepEqual(px(adjust(circle, [500 / W, 500 / H], [500 / W, 500 / H], W, H)), [300, 400, 500, 600]);
  const [l, , r] = px(adjust(circle, [500 / W, 500 / H], [400 / W, 500 / H], W, H));
  assert.equal(r - l, 8);
});
