import assert from "node:assert/strict";
import { test } from "node:test";
import { type Binding, type KeyLike, DEFAULT_BINDINGS, keyTrigger, matchKey, parseBindings, pointerButton, pointerTool, shortcutOf, triggerLabel, withBinding } from "../src/lib/shortcuts.js";

const press = (code: string, key: string, mods: Partial<KeyLike> = {}): KeyLike => ({ code, key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

test("the button of a stylus lends the eraser, the main button alone lends nothing", () => {
  assert.equal(pointerTool(DEFAULT_BINDINGS, 2), "erase");
  // Tip on the page with the button held, then the eraser end of the stylus.
  assert.equal(pointerTool(DEFAULT_BINDINGS, 3), "erase");
  assert.equal(pointerTool(DEFAULT_BINDINGS, 32), "erase");
  assert.equal(pointerTool(DEFAULT_BINDINGS, 1), undefined);
  assert.equal(pointerTool(DEFAULT_BINDINGS, 0), undefined);
  // A button nobody bound.
  assert.equal(pointerTool(DEFAULT_BINDINGS, 4), undefined);
  assert.equal(pointerTool([], 2), undefined);
});

test("the button to record is never the one that draws", () => {
  assert.equal(pointerButton(1), undefined);
  assert.equal(pointerButton(3), 2);
  assert.equal(pointerButton(32), 32);
  assert.equal(pointerButton(4), 4);
});

test("a key matches with exactly its modifiers", () => {
  assert.equal(matchKey(DEFAULT_BINDINGS, press("KeyE", "e"))?.tool, "erase");
  assert.equal(matchKey(DEFAULT_BINDINGS, press("Space", " "))?.mode, "hold");
  // Ctrl + E is not E: the shortcuts of the browser and of the reader (Ctrl + Z) stay theirs.
  assert.equal(matchKey(DEFAULT_BINDINGS, press("KeyE", "e", { ctrlKey: true })), undefined);
  assert.equal(matchKey(DEFAULT_BINDINGS, press("KeyZ", "z", { metaKey: true })), undefined);

  const withCtrl: Binding[] = [{ trigger: keyTrigger(press("KeyE", "e", { ctrlKey: true })), tool: "hl", mode: "switch" }];
  assert.equal(matchKey(withCtrl, press("KeyE", "e", { ctrlKey: true }))?.tool, "hl");
  assert.equal(matchKey(withCtrl, press("KeyE", "e")), undefined);
});

test("a modifier alone is a shortcut of its own, whatever flags it sets", () => {
  const shift = keyTrigger(press("ShiftLeft", "Shift", { shiftKey: true }));
  assert.deepEqual(shift, { kind: "key", code: "ShiftLeft", label: "Maj" });
  const bindings: Binding[] = [{ trigger: shift, tool: "erase", mode: "hold" }];
  assert.equal(matchKey(bindings, press("ShiftLeft", "Shift", { shiftKey: true }))?.tool, "erase");
  assert.equal(matchKey(bindings, press("ShiftRight", "Shift", { shiftKey: true })), undefined);
});

test("labels read as the keys are named", () => {
  assert.equal(triggerLabel(keyTrigger(press("Space", " "))), "Espace");
  assert.equal(triggerLabel(keyTrigger(press("KeyE", "e", { ctrlKey: true, shiftKey: true }))), "Ctrl + Maj + E");
  assert.equal(triggerLabel({ kind: "pointer", button: 2 }), "Bouton du stylet (clic droit)");
  // The hint of a tool button prefers a key to a button of the stylus.
  assert.equal(shortcutOf(DEFAULT_BINDINGS, "erase"), "E");
  assert.equal(shortcutOf(DEFAULT_BINDINGS, "hand"), "Espace");
  assert.equal(shortcutOf([], "pen"), undefined);
});

test("a trigger only does one thing, and a button is always held", () => {
  const e = keyTrigger(press("KeyE", "e"));
  // Recording E for another binding takes it from the eraser.
  const moved = withBinding(DEFAULT_BINDINGS, { trigger: e, tool: "pen", mode: "hold" }, 0);
  assert.equal(moved.filter((b) => b.trigger.kind === "key" && b.trigger.code === "KeyE").length, 1);
  assert.deepEqual(moved[0], { trigger: e, tool: "pen", mode: "hold" });
  assert.equal(moved.length, DEFAULT_BINDINGS.length - 1);

  const added = withBinding([], { trigger: { kind: "pointer", button: 4 }, tool: "hand", mode: "switch" });
  assert.deepEqual(added, [{ trigger: { kind: "pointer", button: 4 }, tool: "hand", mode: "hold" }]);
});

test("what was stored is checked before it is used", () => {
  // Nothing usable: the defaults.
  assert.equal(parseBindings(null), DEFAULT_BINDINGS);
  assert.equal(parseBindings({ v: 2, bindings: [] }), DEFAULT_BINDINGS);
  assert.equal(parseBindings({ v: 1, bindings: "x" }), DEFAULT_BINDINGS);
  // An empty list is a choice: no shortcut at all.
  assert.deepEqual(parseBindings({ v: 1, bindings: [] }), []);
  // What is saved comes back as it was.
  assert.deepEqual(parseBindings(JSON.parse(JSON.stringify({ v: 1, bindings: DEFAULT_BINDINGS }))), DEFAULT_BINDINGS);

  const kept = parseBindings({
    v: 1,
    bindings: [
      { trigger: { kind: "key", code: "KeyG", label: "G", ctrl: "yes" }, tool: "erase", mode: "hold" },
      { trigger: { kind: "key", code: "KeyG", label: "G" }, tool: "pen", mode: "switch" },
      { trigger: { kind: "pointer", button: 2 }, tool: "erase", mode: "switch" },
      { trigger: { kind: "pointer", button: 3 }, tool: "erase", mode: "hold" },
      { trigger: { kind: "key", code: "KeyX", label: "X" }, tool: "laser", mode: "hold" },
      { trigger: { kind: "key", code: "KeyY", label: "Y" }, tool: "pen", mode: "sometimes" },
      { tool: "pen", mode: "hold" },
      null,
    ],
  });
  assert.deepEqual(kept, [
    // The same trigger twice: the last one stands. A flag that is not `true` is not a flag.
    { trigger: { kind: "key", code: "KeyG", label: "G" }, tool: "pen", mode: "switch" },
    { trigger: { kind: "pointer", button: 2 }, tool: "erase", mode: "hold" },
  ]);
});
