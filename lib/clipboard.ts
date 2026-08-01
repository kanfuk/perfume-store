type ClipboardLike = { writeText(value: string): Promise<void> };
type ClipboardDocument = Pick<Document, "body" | "createElement" | "execCommand">;

export async function copyTextWithFallback(
  text: string,
  clipboard?: ClipboardLike,
  documentRef?: ClipboardDocument
) {
  if (!text) return false;
  if (clipboard) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Continúa con el fallback local seleccionable.
    }
  }
  if (!documentRef) return false;
  const textarea = documentRef.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  documentRef.body.appendChild(textarea);
  textarea.select();
  const copied = documentRef.execCommand("copy");
  textarea.remove();
  return copied;
}
