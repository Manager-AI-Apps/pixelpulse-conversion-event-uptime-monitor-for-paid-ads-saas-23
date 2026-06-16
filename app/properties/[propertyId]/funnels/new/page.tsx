"use client";

/**
 * Funnel builder — client component so the step editor can manage local state
 * (dynamically add/remove steps) before submitting to a server action.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, Trash2, Loader2 } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/blocks/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const NAV = [
  {
    title: "Properties",
    href: "/properties",
    icon: <Building2 className="size-4" />,
  },
];

type StepDraft = {
  stepOrder: number;
  url: string;
  actionType: string;
  actionSelector: string;
  expectedEventsJson: string; // raw JSON string, validated on submit
};

const ACTION_TYPES = [
  { value: "navigate", label: "Navigate" },
  { value: "click", label: "Click element" },
  { value: "fill", label: "Fill input" },
  { value: "submit", label: "Submit form" },
];

const DEFAULT_STEP: Omit<StepDraft, "stepOrder"> = {
  url: "",
  actionType: "navigate",
  actionSelector: "",
  expectedEventsJson: "[]",
};

/**
 * Build the URL for this page so it can be passed to the create action
 * (after redirect the server needs the propertyId from params).
 * We extract propertyId from the router pathname client-side.
 */
export default function NewFunnelPage() {
  const router = useRouter();

  // Derive propertyId from the current path: /properties/[propertyId]/funnels/new
  const propertyId = React.useMemo(() => {
    if (typeof window === "undefined") return "";
    const parts = window.location.pathname.split("/");
    // /properties/<id>/funnels/new → parts[2]
    return parts[2] ?? "";
  }, []);

  const [name, setName] = React.useState("");
  const [scheduleMinutes, setScheduleMinutes] = React.useState(15);
  const [steps, setSteps] = React.useState<StepDraft[]>([
    { ...DEFAULT_STEP, stepOrder: 1 },
  ]);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  function addStep() {
    setSteps((prev) => [
      ...prev,
      { ...DEFAULT_STEP, stepOrder: prev.length + 1 },
    ]);
  }

  function removeStep(index: number) {
    setSteps((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, stepOrder: i + 1 })),
    );
  }

  function updateStep(index: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Funnel name is required.");
      return;
    }
    if (!propertyId) {
      setError("Could not determine the property. Please go back and try again.");
      return;
    }
    if (steps.length === 0) {
      setError("Add at least one step.");
      return;
    }

    // Validate JSON for expected events in each step
    const parsedSteps: Array<{
      stepOrder: number;
      url: string;
      actionType: string;
      actionSelector?: string;
      expectedEvents: unknown[];
    }> = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step.url.trim()) {
        setError(`Step ${i + 1}: URL is required.`);
        return;
      }
      let expectedEvents: unknown[] = [];
      try {
        const parsed = JSON.parse(step.expectedEventsJson || "[]");
        if (!Array.isArray(parsed)) throw new Error("Must be an array");
        expectedEvents = parsed;
      } catch {
        setError(`Step ${i + 1}: Expected events must be a valid JSON array.`);
        return;
      }
      parsedSteps.push({
        stepOrder: step.stepOrder,
        url: step.url.trim(),
        actionType: step.actionType,
        actionSelector: step.actionSelector.trim() || undefined,
        expectedEvents,
      });
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/funnels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          name: name.trim(),
          scheduleMinutes,
          steps: parsedSteps,
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        setError(body.error?.message ?? "Failed to create funnel.");
        return;
      }

      router.push(`/properties/${propertyId}/funnels`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell
      appName="PixelPulse"
      nav={NAV}
      header={<PageHeader title="New funnel" />}
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          title="Build a funnel"
          description="Define the steps PixelPulse will replay, and specify which events each step must fire."
        />

        {error ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Funnel metadata */}
          <Card className="rounded-xl border bg-card shadow-sm">
            <CardHeader>
              <CardTitle className="font-display text-xl font-medium">
                Funnel settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="funnel-name">Funnel name</Label>
                <Input
                  id="funnel-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Checkout funnel"
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="schedule">Run every (minutes)</Label>
                <Input
                  id="schedule"
                  type="number"
                  min={5}
                  max={1440}
                  value={scheduleMinutes}
                  onChange={(e) => setScheduleMinutes(Number(e.target.value))}
                  className="w-32 font-mono tabular-nums"
                />
                <p className="text-sm text-muted-foreground">
                  Minimum 5 minutes. Default is 15.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Step editor */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-medium">Steps</h2>
              <Button type="button" variant="outline" size="sm" onClick={addStep}>
                <Plus className="mr-1.5 size-4" />
                Add step
              </Button>
            </div>

            {steps.map((step, index) => (
              <Card key={index} className="rounded-xl border bg-card shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="font-display text-base font-medium text-muted-foreground">
                      Step {step.stepOrder}
                    </CardTitle>
                    {steps.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeStep(index)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Page URL</Label>
                    <Input
                      value={step.url}
                      onChange={(e) => updateStep(index, { url: e.target.value })}
                      placeholder="https://example.com/checkout"
                      type="url"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Action type</Label>
                      <select
                        value={step.actionType}
                        onChange={(e) =>
                          updateStep(index, { actionType: e.target.value })
                        }
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        {ACTION_TYPES.map((at) => (
                          <option key={at.value} value={at.value}>
                            {at.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {step.actionType !== "navigate" && (
                      <div className="space-y-1.5">
                        <Label>CSS selector</Label>
                        <Input
                          value={step.actionSelector}
                          onChange={(e) =>
                            updateStep(index, { actionSelector: e.target.value })
                          }
                          placeholder="#submit-btn"
                          className="font-mono text-sm"
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label>Expected events (JSON array)</Label>
                    <textarea
                      value={step.expectedEventsJson}
                      onChange={(e) =>
                        updateStep(index, { expectedEventsJson: e.target.value })
                      }
                      rows={4}
                      placeholder={`[\n  { "provider": "ga4", "eventName": "purchase", "currency": "USD" }\n]`}
                      className="flex min-h-[96px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      spellCheck={false}
                    />
                    <p className="text-sm text-muted-foreground">
                      Array of event assertion objects. Each should have{" "}
                      <code className="font-mono text-xs">provider</code>,{" "}
                      <code className="font-mono text-xs">eventName</code>, and
                      optional <code className="font-mono text-xs">value</code>.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex justify-end gap-3 pb-8">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create funnel
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
