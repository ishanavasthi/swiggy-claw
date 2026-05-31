"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { ToolCallRecord } from "@/types/agent";

function isError(result: unknown): boolean {
  return !!result && typeof result === "object" && (result as any).success === false;
}

export function ToolCallCard({ rec }: { rec: ToolCallRecord }) {
  const [open, setOpen] = useState(false);
  const pending = rec.result === undefined;
  const errored = !pending && isError(rec.result);

  return (
    <div className="rounded-lg border bg-muted/40 text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            pending ? "animate-pulse bg-amber-500" : errored ? "bg-red-500" : "bg-emerald-500"
          }`}
        />
        <Badge variant="secondary" className="font-mono">{rec.name}</Badge>
        <span className="text-muted-foreground">
          {pending ? "running…" : errored ? "error" : "done"}
        </span>
        <span className="ml-auto text-muted-foreground">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t px-3 py-2">
          <div>
            <div className="mb-1 font-medium text-muted-foreground">args</div>
            <pre className="overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(rec.args, null, 2)}</pre>
          </div>
          {!pending && (
            <div>
              <div className="mb-1 font-medium text-muted-foreground">result</div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(rec.result, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
