const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

// Matches markdown-style [label](url) links. Only http(s) URLs are linkified
// so a stray "javascript:" or other scheme typed into the admin textarea
// can't produce a clickable script link.
const MARKDOWN_LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

// Renders an admin-authored plain-text message as a minimal HTML email body,
// preserving line breaks and turning [label](url) into a real link. Escapes
// everything else first since it's free-form input.
export function messageToHtml(message: string): string {
  const escaped = escapeHtml(message).replace(MARKDOWN_LINK, (_match, label: string, url: string) => {
    return `<a href="${url}" style="color: #059669;">${label}</a>`;
  });
  return `<div style="font-family: sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b; white-space: pre-wrap;">${escaped}</div>`;
}
