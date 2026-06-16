import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  Activity,
  Building2,
  CheckCircle2,
  Clock,
  GitBranch,
  XCircle,
} from "lucide-react";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listProperties } from "@/lib/actions/properties";
import { listFunnels, listFunnelSteps } from "@/lib/actions/funnels";
import {
  getLatestRunWithStepResults,
  getUptimePercent,
} from "@/lib/actions/monitor-runs";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/blocks/page-header";
import { StatCard } from "@/components/blocks/stat-card";
import { DataTable } from "@/components/blocks/data-table";
import type { Column } from "@/components/blocks/data-table";
import { EmptyState } from "@/components/blocks/empty-state";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExpectedEvent = {
  eventName: string;
  platform?: string;
  value?: number;
  currency?: string;
};

type StepWithResult = {
  id: string;
  stepOrder: number;
  url: string;
  actionType: string;
  expectedEvents: ExpectedEvent[];
  passed: boolean | null;
  diagnosis: string | null;
};

// ---------------------------------------------------------------------------
// NAV
// ---------------------------------------------------------------------------

const NAV = [
  {
    title: "Properties",
    href: "/properties",
    icon: <Building2 className="size-4" />,
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function FunnelDetailPage({
  params,
}: {
  params: Promise<{ propertyId: string; funnelId: string }>;
}) {
  const { propertyId, funnelId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    redirect(`/sign-in?next=/properties/${propertyId}/funnels/${funnelId}`);

  // Load property + funnel + steps + run results in parallel where independent
  const [properties, steps, latestRun, uptimePercent] = await Promise.all([
    listProperties(db, session.user.id),
    listFunnelSteps(db, session.user.id, funnelId).catch(() => null),
    getLatestRunWithStepResults(db, session.user.id, funnelId).catch(
      () => null,
    ),
    getUptimePercent(db, session.user.id, funnelId, 30).catch(() => null),
  ]);

  const prop = properties.find((p) => p.id === propertyId);
  if (!prop) notFound();

  if (steps === null) notFound();

  // Resolve funnel name for the header
  const funnels = await listFunnels(db, session.user.id, propertyId).catch(
    () => [],
  );
  const funnelRow = funnels.find((f) => f.id === funnelId);
  const funnelName = funnelRow?.name ?? "Funnel";

  // Build a map of stepId → step result from the latest run
  const stepResultMap = new Map<
    string,
    { passed: boolean; diagnosis: string | null }
  >();
  if (latestRun) {
    for (const sr of latestRun.stepResults) {
      stepResultMap.set(sr.stepId, {
        passed: sr.passed,
        diagnosis: sr.diagnosis ?? null,
      });
    }
  }

  // Merge steps + results
  const rows: StepWithResult[] = steps.map((step) => {
    const result = stepResultMap.get(step.id) ?? null;
    const rawEvents = step.expectedEvents;
    const expectedEvents: ExpectedEvent[] = Array.isArray(rawEvents)
      ? (rawEvents as ExpectedEvent[])
      : [];
    return {
      id: step.id,
      stepOrder: step.stepOrder,
      url: step.url,
      actionType: step.actionType,
      expectedEvents,
      passed: result ? result.passed : null,
      diagnosis: result ? result.diagnosis : null,
    };
  });

  // ---------------------------------------------------------------------------
  // Table columns
  // ---------------------------------------------------------------------------

  const columns: Column<StepWithResult>[] = [
    {
      key: "order",
      header: "#",
      cell: (row) => (
        <span className="font-mono tabular-nums text-muted-foreground text-sm">
          {row.stepOrder}
        </span>
      ),
      className: "w-10",
    },
    {
      key: "url",
      header: "URL",
      cell: (row) => (
        <span className="font-mono text-sm text-foreground break-all">
          {row.url}
        </span>
      ),
    },
    {
      key: "expectedEvents",
      header: "Expected events",
      cell: (row) =>
        row.expectedEvents.length === 0 ? (
          <span className="text-muted-foreground text-sm">—</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.expectedEvents.map((ev, i) => (
              <Badge key={i} variant="secondary" className="font-mono text-xs">
                {ev.platform ? `${ev.platform}:` : ""}
                {ev.eventName}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      key: "status",
      header: "Last run",
      cell: (row) => {
        if (row.passed === null) {
          return (
            <Badge variant="secondary" className="text-xs">
              Never run
            </Badge>
          );
        }
        return row.passed ? (
          <span className="inline-flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
            <CheckCircle2 className="size-3.5" />
            Passed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-sm text-destructive">
            <XCircle className="size-3.5" />
            Failed
          </span>
        );
      },
    },
    {
      key: "diagnosis",
      header: "Diagnosis",
      cell: (row) =>
        row.diagnosis ? (
          <span className="text-sm text-muted-foreground">{row.diagnosis}</span>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        ),
    },
  ];

  // ---------------------------------------------------------------------------
  // Derived stats
  // ---------------------------------------------------------------------------

  const lastRunLabel = latestRun
    ? new Date(latestRun.ranAt).toLocaleString()
    : "Never";

  const uptimeLabel =
    uptimePercent !== null ? `${uptimePercent}%` : "No data";

  const overallStatus =
    latestRun === null
      ? "secondary"
      : latestRun.status === "passed"
        ? "default"
        : "destructive";

  return (
    <AppShell
      appName="PixelPulse"
      nav={NAV}
      header={<PageHeader title={prop.name} description={prop.domain} />}
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          title={funnelName}
          description={`Step-by-step event assertions for ${prop.domain}`}
          actions={
            latestRun ? (
              <Badge variant={overallStatus} className="text-sm">
                {latestRun.status === "passed" ? "All passing" : "Failing"}
              </Badge>
            ) : undefined
          }
        />

        {/* Stat cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="30-day uptime"
            value={uptimeLabel}
            icon={Activity}
            hint="% of synthetic runs that passed all assertions"
          />
          <StatCard
            label="Steps"
            value={rows.length}
            icon={GitBranch}
            hint="Funnel steps being monitored"
          />
          <StatCard
            label="Last run"
            value={
              <span className="text-base font-medium">{lastRunLabel}</span>
            }
            icon={Clock}
            hint="Most recent synthetic execution"
          />
        </div>

        {/* Step table */}
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={GitBranch}
              title="No steps recorded"
              description="Use the Chrome extension to record your signup or checkout flow — PixelPulse will replay it on a schedule and check every expected event."
            />
          }
        />
      </div>
    </AppShell>
  );
}
