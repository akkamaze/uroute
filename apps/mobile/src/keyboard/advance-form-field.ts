import type { KeyboardEvent } from "react";

export function advanceFormField(event: KeyboardEvent<HTMLFormElement>): void {
  const current = event.target;
  if (
    event.key !== "Enter" ||
    event.nativeEvent.isComposing ||
    !(current instanceof HTMLInputElement) ||
    current.enterKeyHint !== "next"
  ) {
    return;
  }
  const fields = Array.from(
    event.currentTarget.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >("input, textarea, select"),
  ).filter(
    (field) =>
      !field.disabled &&
      field.tabIndex >= 0 &&
      !(
        field instanceof HTMLInputElement &&
        [
          "hidden",
          "radio",
          "checkbox",
          "button",
          "submit",
          "reset",
          "file",
          "range",
          "color",
        ].includes(field.type)
      ),
  );
  const index = fields.indexOf(current);
  const next = index < 0 ? undefined : fields[index + 1];
  if (next !== undefined && next !== current) {
    event.preventDefault();
    next.focus({ preventScroll: true });
  }
}
