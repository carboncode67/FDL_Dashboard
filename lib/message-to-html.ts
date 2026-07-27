const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

// Renders an admin-authored plain-text message as a minimal HTML email body,
// preserving line breaks. Escapes the text first since it's free-form input.
export function messageToHtml(message: string): string {
  const escaped = message.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
  return `<div style="font-family: sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b; white-space: pre-wrap;">${escaped}</div>`;
}
