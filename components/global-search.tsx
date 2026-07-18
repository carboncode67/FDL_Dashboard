"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchHit {
  entity: string;
  id: number;
  title: string;
  context: string | null;
  matched_field: string;
  snippet: string;
  url: string;
}

const ENTITY_LABELS: Record<string, string> = {
  farms: "Farms",
  experiments: "Experiments",
  projects: "Projects",
  contacts: "Farmers",
  fields: "Fields",
  tests: "Tests",
  treatments: "Treatments",
  tasks: "Tasks",
  uploads: "Data Uploads",
};

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-amber-200 text-slate-900 rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Cmd+K / Ctrl+K opens the dialog
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const runSearch = useCallback(async (q: string) => {
    abortRef.current?.abort();
    if (q.trim().length < 2) {
      setHits([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHits(data.hits ?? []);
      setSearched(true);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setHits([]);
        setSearched(true);
      }
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, []);

  function onQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(value), 300);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setHits([]);
      setSearched(false);
    }
  }

  function go(hit: SearchHit) {
    onOpenChange(false);
    router.push(hit.url);
  }

  const grouped = hits.reduce<Record<string, SearchHit[]>>((acc, h) => {
    (acc[h.entity] ??= []).push(h);
    return acc;
  }, {});

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 text-slate-500",
          "px-2.5 py-1.5 text-sm hover:bg-slate-100 hover:text-slate-700 transition-colors",
        )}
        aria-label="Search"
      >
        <Search className="h-4 w-4" />
        <span className="hidden md:inline">Search</span>
        <kbd className="hidden md:inline rounded border border-slate-200 bg-white px-1 text-[10px] text-slate-400">
          ⌘K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="sr-only">Search</DialogTitle>
            <div className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Search farms, experiments, uploads…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
              {loading && <span className="text-xs text-slate-400 shrink-0">searching…</span>}
            </div>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto px-2 pb-3">
            {query.trim().length < 2 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-400">
                Type at least two characters to search the whole database.
              </p>
            ) : searched && hits.length === 0 && !loading ? (
              <p className="px-3 py-6 text-center text-sm text-slate-400">
                No results for “{query.trim()}”.
              </p>
            ) : (
              Object.entries(grouped).map(([entity, entityHits]) => (
                <div key={entity} className="mb-1">
                  <p className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {ENTITY_LABELS[entity] ?? entity}
                  </p>
                  {entityHits.map((hit) => (
                    <button
                      key={`${hit.entity}-${hit.matched_field}-${hit.id}`}
                      onClick={() => go(hit)}
                      className="w-full rounded-md px-3 py-2 text-left hover:bg-slate-100"
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-slate-900 truncate">
                          <Highlight text={hit.title} query={query.trim()} />
                        </span>
                        {hit.context && (
                          <span className="text-xs text-slate-400 truncate shrink-0">
                            {hit.context}
                          </span>
                        )}
                      </span>
                      {hit.snippet && hit.snippet !== hit.title && (
                        <span className="mt-0.5 block text-xs text-slate-500 line-clamp-2">
                          <Highlight text={hit.snippet} query={query.trim()} />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
