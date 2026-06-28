"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface DateInputProps {
  value: string;        // YYYY-MM-DD or ""
  onChange: (v: string) => void;
  className?: string;
}

function toDisplay(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function toIso(display: string): string {
  const parts = display.split("/");
  if (parts.length !== 3) return "";
  const [m, d, y] = parts;
  if (y.length !== 4) return "";
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function isValidDate(display: string): boolean {
  const parts = display.split("/");
  if (parts.length !== 3) return false;
  const [m, d, y] = parts.map(Number);
  if (!m || !d || !y || y < 1900 || y > 2200) return false;
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function DateInput({ value, onChange, className }: DateInputProps) {
  const [text, setText] = useState(toDisplay(value));
  const [error, setError] = useState(false);

  function handleChange(raw: string) {
    // Strip non-digit non-slash, then auto-insert slashes
    const digits = raw.replace(/\D/g, "");
    let formatted = digits;
    if (digits.length > 2) formatted = digits.slice(0, 2) + "/" + digits.slice(2);
    if (digits.length > 4) formatted = digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4, 8);

    // If user manually typed slashes, respect them
    const hasSlashes = raw.includes("/");
    const display = hasSlashes ? raw.replace(/[^\d/]/g, "").slice(0, 10) : formatted;

    setText(display);
    setError(false);

    const iso = toIso(display);
    if (iso && isValidDate(display)) {
      onChange(iso);
    } else if (!display) {
      onChange("");
    }
  }

  function handleBlur() {
    if (!text) {
      setError(false);
      return;
    }
    if (!isValidDate(text)) {
      setError(true);
    } else {
      setError(false);
    }
  }

  return (
    <div className={cn("space-y-1", className)}>
      <input
        type="text"
        inputMode="numeric"
        placeholder="MM/DD/YYYY"
        maxLength={10}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        className={cn(
          "h-8 w-full rounded-lg border bg-transparent px-3 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          error ? "border-red-500" : "border-input"
        )}
      />
      {error && <p className="text-xs text-red-500">Enter a valid date (MM/DD/YYYY)</p>}
    </div>
  );
}
