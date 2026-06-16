"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";

import { Button } from "@/components/ui/button";

interface RunNowButtonProps {
  funnelId: string;
}

export function RunNowButton({ funnelId }: RunNowButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/monitor/trigger/${funnelId}`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        const msg =
          body?.error?.message ?? `Request failed (HTTP ${res.status})`;
        setError(msg);
      } else {
        // Refresh the page so the latest run results appear
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={loading}
        className="gap-1.5 transition-colors"
      >
        <Play className="size-3.5" />
        {loading ? "Running…" : "Run now"}
      </Button>
      {error && (
        <p className="text-xs text-destructive max-w-48 text-right">{error}</p>
      )}
    </div>
  );
}
