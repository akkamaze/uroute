import { afterAll, expect, test } from "bun:test";
import { advanceFormField } from "../src/keyboard/advance-form-field.ts";
const original = globalThis.HTMLInputElement;
class Input {
  type = "text";
  enterKeyHint = "next";
  disabled = false;
  tabIndex = 0;
  focused = false;
  focus(options) {
    this.focused = options.preventScroll;
  }
}
globalThis.HTMLInputElement = Input;
afterAll(() => {
  globalThis.HTMLInputElement = original;
});
function event(target, fields, options = {}) {
  return {
    target,
    currentTarget: { querySelectorAll: () => fields },
    key: "Enter",
    nativeEvent: { isComposing: false },
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
    ...options,
  };
}
test("explicit Next skips category controls and preserves browser scroll ownership", () => {
  const current = new Input();
  const radio = new Input();
  radio.type = "radio";
  const disabled = new Input();
  disabled.disabled = true;
  const next = new Input();
  const action = event(current, [current, radio, disabled, next]);
  advanceFormField(action);
  expect(action.prevented).toBe(true);
  expect(next.focused).toBe(true);
  expect(radio.focused).toBe(false);
  expect(disabled.focused).toBe(false);
});
test("Done, ordinary keys and IME composition keep default behavior", () => {
  const current = new Input();
  const next = new Input();
  for (const options of [{ key: "a" }, { nativeEvent: { isComposing: true } }]) {
    const action = event(current, [current, next], options);
    advanceFormField(action);
    expect(action.prevented).toBe(false);
  }
  current.enterKeyHint = "done";
  const action = event(current, [current, next]);
  advanceFormField(action);
  expect(action.prevented).toBe(false);
  expect(next.focused).toBe(false);
});
test("textarea Enter never moves focus or submits through the helper", () => {
  const textarea = {};
  const next = new Input();
  const action = event(textarea, [textarea, next]);
  advanceFormField(action);
  expect(action.prevented).toBe(false);
  expect(next.focused).toBe(false);
});
test("a missing or final field never wraps focus to the first field", () => {
  const current = new Input();
  const first = new Input();
  for (const fields of [[first], [first, current]]) {
    const action = event(current, fields);
    advanceFormField(action);
    expect(action.prevented).toBe(false);
    expect(first.focused).toBe(false);
  }
});
