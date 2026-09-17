"use client";

import { useEffect } from "react";

// Last-resort boundary: catches an exception thrown by the root layout
// itself (below app/(dashboard)/error.tsx, which handles the far more common
// case of a page inside the dashboard shell throwing). Must render its own
// <html>/<body> since the root layout is what failed.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-slate-50 text-center px-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 mb-2">Something went wrong</h1>
          <p className="text-sm text-slate-500 mb-4">
            Try reloading. If it keeps happening, sign out and back in.
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={() => reset()}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
            >
              Try again
            </button>
            <a
              href="/login"
              className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white"
            >
              Go to sign in
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
