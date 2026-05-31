"use client";

import { useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";

export function InputBar({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const [value, setValue] = useState("");

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex items-end gap-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        placeholder="Order food, buy groceries, or book a table…  (Ctrl/Cmd+Enter to send)"
        className="flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        disabled={disabled}
      />
      <Button onClick={submit} disabled={disabled || !value.trim()} className="h-[52px]">
        Send
      </Button>
    </div>
  );
}
