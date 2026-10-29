// Clipboard access can be denied (insecure origin, permissions), so report success instead of throwing.
export async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
