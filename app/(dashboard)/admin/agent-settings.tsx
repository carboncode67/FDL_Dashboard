"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface AgentTokenRow {
  id: number;
  name: string;
  token_prefix: string;
  scopes: string[];
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
}

export interface AgentTagRow {
  id: number;
  name: string;
  description: string | null;
}

function fmt(d: string | null): string {
  return d ? new Date(d).toLocaleDateString() : "—";
}

function tokenState(t: AgentTokenRow): { label: string; variant: "secondary" | "destructive" | "outline" } {
  if (t.revoked_at) return { label: "Revoked", variant: "destructive" };
  if (t.expires_at && new Date(t.expires_at) <= new Date()) return { label: "Expired", variant: "outline" };
  return { label: "Active", variant: "secondary" };
}

export function AgentSettings({
  initialTokens,
  initialTags,
}: {
  initialTokens: AgentTokenRow[];
  initialTags: AgentTagRow[];
}) {
  const [tokens, setTokens] = useState(initialTokens);
  const [tags, setTags] = useState(initialTags);
  const [tokenName, setTokenName] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [tagName, setTagName] = useState("");
  const [tagDescription, setTagDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(url: string, init: RequestInit): Promise<Record<string, unknown> | null> {
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

  async function createToken() {
    const json = await call("/api/admin/agent-tokens", {
      method: "POST",
      body: JSON.stringify({ name: tokenName, read_only: readOnly }),
    });
    if (!json) return;
    const { token, ...row } = json as unknown as AgentTokenRow & { token: string };
    setTokens([{ ...row, revoked_at: null, last_used_at: null }, ...tokens]);
    setNewToken(token);
    setTokenName("");
  }

  async function revokeToken(id: number) {
    if (!(await call(`/api/admin/agent-tokens/${id}`, { method: "DELETE" }))) return;
    setTokens(tokens.map((t) => (t.id === id ? { ...t, revoked_at: new Date().toISOString() } : t)));
  }

  async function addTag() {
    const json = await call("/api/admin/agent-tags", {
      method: "POST",
      body: JSON.stringify({ name: tagName, description: tagDescription }),
    });
    if (!json) return;
    setTags([...tags, json as unknown as AgentTagRow].sort((a, b) => a.name.localeCompare(b.name)));
    setTagName("");
    setTagDescription("");
  }

  async function deleteTag(id: number) {
    if (!(await call(`/api/admin/agent-tags/${id}`, { method: "DELETE" }))) return;
    setTags(tags.filter((t) => t.id !== id));
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-stone-900">Agent tokens</h3>
        <p className="text-xs text-stone-500">
          An agent token can only call <code>/api/agent/*</code>: read this lab&apos;s research data (no contact
          data, no credentials) and write comments, tags, links, recommendations and analysis specs to the
          agent&apos;s own tables. It can&apos;t change research data, log in, or reach any other route.
        </p>

        {newToken && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
            <p className="text-sm font-medium text-amber-900">Copy this token now — it won&apos;t be shown again.</p>
            <code className="block break-all text-xs text-stone-900">{newToken}</code>
            <Button size="sm" variant="outline" onClick={() => setNewToken(null)}>
              Done
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="w-64"
            placeholder="Token name (e.g. Datamachine agents)"
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
          />
          <label className="flex items-center gap-1.5 text-sm text-stone-700">
            <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} />
            Read only
          </label>
          <Button size="sm" disabled={busy || !tokenName.trim()} onClick={createToken}>
            Create token
          </Button>
        </div>

        {tokens.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((t) => {
                const state = tokenState(t);
                return (
                  <TableRow key={t.id}>
                    <TableCell>{t.name}</TableCell>
                    <TableCell>
                      <code className="text-xs">{t.token_prefix}…</code>
                    </TableCell>
                    <TableCell className="text-xs">{t.scopes.join(", ")}</TableCell>
                    <TableCell className="text-xs">{fmt(t.last_used_at)}</TableCell>
                    <TableCell className="text-xs">{fmt(t.expires_at)}</TableCell>
                    <TableCell>
                      <Badge variant={state.variant}>{state.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {!t.revoked_at && (
                        <Button size="xs" variant="destructive" disabled={busy} onClick={() => revokeToken(t.id)}>
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-stone-900">Tag vocabulary</h3>
        <p className="text-xs text-stone-500">
          The tags the agent may apply in this lab. It can&apos;t create tags itself — it suggests new ones for
          review instead.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input className="w-48" placeholder="Tag" value={tagName} onChange={(e) => setTagName(e.target.value)} />
          <Input
            className="w-80"
            placeholder="What it means (optional, shown to the agent)"
            value={tagDescription}
            onChange={(e) => setTagDescription(e.target.value)}
          />
          <Button size="sm" disabled={busy || !tagName.trim()} onClick={addTag}>
            Add tag
          </Button>
        </div>
        {tags.length === 0 ? (
          <p className="text-sm text-stone-500">No tags yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100 rounded-md border border-stone-200">
            {tags.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div>
                  <span className="text-sm font-medium text-stone-900">{t.name}</span>
                  {t.description && <span className="ml-2 text-xs text-stone-500">{t.description}</span>}
                </div>
                <Button size="xs" variant="ghost" disabled={busy} onClick={() => deleteTag(t.id)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
