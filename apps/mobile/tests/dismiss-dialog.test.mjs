import { expect, test } from "bun:test";
import { beginDialogDismissal } from "../src/keyboard/dismiss-dialog.ts";
test("duplicate Escape/close requests can traverse history only once per opening", () => {
  const dialog = {
    open: true,
    close() {
      this.open = false;
    },
  };
  let backRequests = 0;
  const close = () => {
    if (beginDialogDismissal(dialog)) {
      backRequests++;
    }
  };
  close();
  close();
  close();
  expect(backRequests).toBe(1);
  expect(dialog.open).toBe(false);
  dialog.open = true;
  close();
  expect(backRequests).toBe(2);
});
test("missing or already-closed surfaces cannot dismiss a parent route", () => {
  expect(beginDialogDismissal(null)).toBe(false);
  expect(beginDialogDismissal({ open: false })).toBe(false);
});
