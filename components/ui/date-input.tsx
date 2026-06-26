"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const FIELD = "h-8 rounded-lg border border-input bg-transparent px-2 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

interface DateInputProps {
  value: string;        // YYYY-MM-DD or ""
  onChange: (v: string) => void;
  className?: string;
}

export function DateInput({ value, onChange, className }: DateInputProps) {
  const parts = value ? value.split("-") : [];

  const [year,  setYear]  = useState(parts[0] ?? "");
  const [month, setMonth] = useState(parts[1] ? String(parseInt(parts[1])) : "");
  const [day,   setDay]   = useState(parts[2] ? String(parseInt(parts[2])) : "");

  function emit(ny: string, nm: string, nd: string) {
    const yi = parseInt(ny);
    const mi = parseInt(nm);
    const di = parseInt(nd);
    if (ny.length === 4 && yi >= 1900 && yi <= 2200 && mi >= 1 && mi <= 12 && di >= 1 && di <= 31) {
      onChange(`${ny}-${String(mi).padStart(2, "0")}-${String(di).padStart(2, "0")}`);
    } else if (!ny && !nm && !nd) {
      onChange("");
    }
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <input
        type="text"
        inputMode="numeric"
        placeholder="YYYY"
        maxLength={4}
        className={cn(FIELD, "w-16 text-center")}
        value={year}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 4);
          setYear(v);
          emit(v, month, day);
        }}
      />
      <span className="text-muted-foreground text-xs select-none">-</span>
      <select
        className={cn(FIELD, "w-[72px] cursor-pointer")}
        value={month}
        onChange={(e) => {
          setMonth(e.target.value);
          emit(year, e.target.value, day);
        }}
      >
        <option value="">MM</option>
        {MONTHS.map((name, i) => (
          <option key={i + 1} value={String(i + 1)}>{name}</option>
        ))}
      </select>
      <span className="text-muted-foreground text-xs select-none">-</span>
      <input
        type="number"
        placeholder="DD"
        min={1}
        max={31}
        className={cn(FIELD, "w-14 text-center")}
        value={day}
        onChange={(e) => {
          const v = e.target.value.slice(0, 2);
          setDay(v);
          emit(year, month, v);
        }}
      />
    </div>
  );
}
