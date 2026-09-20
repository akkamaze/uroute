export function beginDialogDismissal(dialog: HTMLDialogElement | null): boolean {
  if (dialog === null || !dialog.open) {
    return false;
  }
  // History traversal is asynchronous. Remove the native surface before requesting it once.
  dialog.close();

  return true;
}
