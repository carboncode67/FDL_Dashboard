// Minimal CSV writer — no library in package.json for this yet, and RFC 4180 escaping is
// small enough not to warrant one. `rows` are pre-stringified cells (format numbers/dates
// before calling in); `null`/`undefined` become an empty cell.
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const escapeCell = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header, ...rows].map((row) => row.map(escapeCell).join(","));
  return lines.join("\r\n") + "\r\n";
}
