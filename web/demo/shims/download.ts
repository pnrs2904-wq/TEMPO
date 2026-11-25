/** Tries a normal download; where the host page blocks downloads, copies the content instead. */
export function download(name: string, content: string, type: string) {
  try {
    void navigator.clipboard?.writeText(content).catch(() => undefined);
  } catch { /* ignore */ }
  try {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent("tempo-toast", { detail: `${name}: downloaded, or copied to the clipboard if downloads are blocked here.` }));
}
