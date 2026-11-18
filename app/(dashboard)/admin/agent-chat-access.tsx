"use client";

import { useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KIND_SPECS, type AgentKind } from "@/lib/agent/kinds";

interface Grant {
  id: number;
  agent_kind: string;
  user_id: string | null;
  contact_id: number | null;
  created_at: string;
}
interface Person {
  type: "user" | "contact";
  id: string;
  name: string;
  detail: string;
  has_app_token: boolean;
}

const key = (type: "user" | "contact", id: string) => `${type}:${id}`;

/**
 * The approved list for the agent chat outside the web dashboard
 * (/api/admin/agent-chat-access, docs/agent-chat-access.md). Only approved
 * people see the chat icon in FarmerDataLogger; OFE Dashboard will use the
 * same list.
 */
export function AgentChatAccess() {
  const [kinds, setKinds] = useState<AgentKind[]>([]);
  const [kind, setKind] = useState<AgentKind>("cartographer");
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/agent-chat-access")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
        setKinds(j.kinds);
        setGrants(j.grants);
        setPeople(j.people);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const byKey = useMemo(() => new Map(people.map((p) => [key(p.type, p.id), p])), [people]);
  const granted = useMemo(
    () => new Set((grants ?? []).filter((g) => g.agent_kind === kind).map((g) => (g.user_id ? key("user", g.user_id) : key("contact", String(g.contact_id))))),
    [grants, kind],
  );
  const candidates = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return [];
    return people
      .filter((p) => !granted.has(key(p.type, p.id)) && `${p.name} ${p.detail}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [people, granted, filter]);

  async function call(url: string, init: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Request failed (${res.status})`);
        return null;
      }
      return json;
    } finally {
      setBusy(false);
    }
  }

  async function grant(p: Person) {
    const json = await call("/api/admin/agent-chat-access", {
      method: "POST",
      body: JSON.stringify({ agent_kind: kind, ...(p.type === "user" ? { user_id: p.id } : { contact_id: Number(p.id) }) }),
    });
    if (!json) return;
    setGrants((g) => [json as Grant, ...(g ?? []).filter((x) => x.id !== json.id)]);
    setFilter("");
  }

  async function revoke(id: number) {
    if (!(await call(`/api/admin/agent-chat-access/${id}`, { method: "DELETE" }))) return;
    setGrants((g) => (g ?? []).filter((x) => x.id !== id));
  }

  const rows = (grants ?? []).filter((g) => g.agent_kind === kind);

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-stone-900">Chat access (phone app)</h3>
      <p className="text-xs text-stone-500">
        Only the people listed here see the agent chat icon in FarmerDataLogger, and only on sampling maps sent to
        them. They can ask the agent for drafts and apply them to those maps. OFE Dashboard will use the same list.
        The web dashboard&apos;s chat isn&apos;t affected.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {kinds.length > 1 && (
          <select
            className="h-8 rounded-md border border-stone-200 bg-white px-2 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value as AgentKind)}
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {KIND_SPECS[k].label}
              </option>
            ))}
          </select>
        )}
        <div className="relative">
          <Input
            className="w-80"
            placeholder={`Add a lab member or farmer to ${KIND_SPECS[kind]?.label ?? kind}…`}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            disabled={grants == null}
          />
          {candidates.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full divide-y divide-stone-100 rounded-md border border-stone-200 bg-white shadow-sm">
              {candidates.map((p) => (
                <li key={key(p.type, p.id)}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => grant(p)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-stone-50"
                  >
                    <span>
                      {p.name} <span className="text-xs text-stone-500">{p.detail}</span>
                    </span>
                    {!p.has_app_token && <span className="text-xs text-amber-700">no app token</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {grants == null ? (
        !error && <p className="text-sm text-stone-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-stone-500">Nobody yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>App</TableHead>
              <TableHead>Added</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((g) => {
              const p = g.user_id ? byKey.get(key("user", g.user_id)) : byKey.get(key("contact", String(g.contact_id)));
              return (
                <TableRow key={g.id}>
                  <TableCell>{p?.name ?? (g.user_id ? `User ${g.user_id}` : `Contact #${g.contact_id}`)}</TableCell>
                  <TableCell className="text-xs">{p?.detail ?? (g.user_id ? "Lab member" : "Farmer")}</TableCell>
                  <TableCell>
                    {p?.has_app_token ? (
                      <Badge variant="secondary">Token issued</Badge>
                    ) : (
                      <Badge variant="outline">No app token</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{new Date(g.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <Button size="xs" variant="destructive" disabled={busy} onClick={() => revoke(g.id)}>
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
