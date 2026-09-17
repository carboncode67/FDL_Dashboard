"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

// Catches any uncaught exception thrown while rendering a dashboard page
// (e.g. a stale/incomplete session hitting a tenant-scoping guard) and shows
// a recoverable screen instead of a broken/blank page load — see proxy.ts
// for the specific stale-session case this also guards against upstream.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center px-4">
      <AlertTriangle className="h-8 w-8 text-amber-500" />
      <h2 className="text-lg font-semibold text-stone-900">Something went wrong loading this page</h2>
      <p className="max-w-md text-sm text-stone-500">
        This can happen after a deploy if your sign-in is out of date. Try again, or sign out and
        back in.
      </p>
      <div className="flex gap-2 mt-1">
        <Button variant="outline" onClick={() => reset()}>
          Try again
        </Button>
        <Button onClick={() => signOut({ callbackUrl: "/login" })}>Sign out</Button>
      </div>
    </div>
  );
}
