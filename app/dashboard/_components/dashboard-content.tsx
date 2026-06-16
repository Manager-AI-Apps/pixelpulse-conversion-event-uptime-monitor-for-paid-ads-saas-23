"use client";

/**
 * DashboardContent — pure presentational component for the dashboard page.
 *
 * Exported separately so it can be unit-tested without importing the auth/db
 * modules that the async Server Component page pulls in. The page fetches the
 * data and passes it here as props.
 */

import * as React from "react";
import { AlertTriangle } from "lucide-react";

import type { PropertyStat } from "@/lib/queries/dashboard";
import { DataTable, type Column } from "@/components/blocks/data-table";
import { EmptyState } from "@/components/blocks/empty-state";
import { PageHeader } from "@/components/blocks/page-header";
import { StatCard } from "@/components/blocks/stat-card";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TableRow = {
  propertyId: string;
  propertyName: string;
  domain: string;
  uptimePct7d: number | null;
  uptimePct30d: number | null;
  lastDiagnosis: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPct(pct: number | null): string {
  return pct !== null ? `${pct}%` : "—";
}

/** Compute the mean uptime across all properties that have runs. */
function avgUptimePct(stats: PropertyStat[]): number | null {
  const withRuns = stats.filter((s) => s.uptimePct !== null);
  if (withRuns.length === 0) return null;
  const sum = withRuns.reduce((acc, s) => acc + (s.uptimePct as number), 0);
  return Math.round(sum / withRuns.length);
}

// ---------------------------------------------------------------------------
// Table columns
// ---------------------------------------------------------------------------

const COLUMNS: Column<TableRow>[] = [
  {
    key: "property",
    header: "Property",
    cell: (row) => (
      <div>
        <p className="font-medium text-foreground">{row.propertyName}</p>
        <p className="text-sm text-muted-foreground">{row.domain}</p>
      </div>
    ),
  },
  {
    key: "uptime7d",
    header: "7-Day Uptime",
    numeric: true,
    cell: (row) => (
      <span className={row.uptimePct7d !== null && row.uptimePct7d < 90 ? "text-destructive" : ""}>
        {formatPct(row.uptimePct7d)}
      </span>
    ),
  },
  {
    key: "uptime30d",
    header: "30-Day Uptime",
    numeric: true,
    cell: (row) => (
      <span className={row.uptimePct30d !== null && row.uptimePct30d < 90 ? "text-destructive" : ""}>
        {formatPct(row.uptimePct30d)}
      </span>
    ),
  },
  {
    key: "diagnosis",
    header: "Last Issue",
    cell: (row) =>
      row.lastDiagnosis ? (
        <Badge variant="destructive" className="font-normal">
          {row.lastDiagnosis}
        </Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DashboardContent({
  stats7d,
  stats30d,
}: {
  stats7d: PropertyStat[];
  stats30d: PropertyStat[];
}) {
  // Merge 7d and 30d stats into a single table row per property.
  const tableRows: TableRow[] = stats30d.map((s30) => {
    const s7 = stats7d.find((s) => s.propertyId === s30.propertyId);
    return {
      propertyId: s30.propertyId,
      propertyName: s30.propertyName,
      domain: s30.domain,
      uptimePct7d: s7?.uptimePct ?? null,
      uptimePct30d: s30.uptimePct,
      lastDiagnosis: s30.lastDiagnosis,
    };
  });

  const avg7d = avgUptimePct(stats7d);
  const avg30d = avgUptimePct(stats30d);
  const propertyCount = stats30d.length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Dashboard"
        description="Monitor conversion event uptime across all your properties."
      />

      {/* Static ad-spend-at-risk callout */}
      <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <p className="text-sm text-destructive">
          <span className="font-semibold">25–30% of ad spend at risk</span> when a
          conversion pixel breaks silently — broken events stop bidding
          optimisation from working.
        </p>
      </div>

      {/* Summary stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Properties"
          value={propertyCount}
          hint="Properties you are currently monitoring"
        />
        <StatCard
          label="Avg 7-Day Uptime"
          value={avg7d !== null ? `${avg7d}%` : "—"}
          hint="Mean uptime across all properties over the past 7 days"
        />
        <StatCard
          label="Avg 30-Day Uptime"
          value={avg30d !== null ? `${avg30d}%` : "—"}
          hint="Mean uptime across all properties over the past 30 days"
        />
      </div>

      {/* Per-property table */}
      <DataTable
        columns={COLUMNS}
        rows={tableRows}
        getRowKey={(row) => row.propertyId}
        empty={
          <EmptyState
            title="No properties yet"
            description="Add a property to start monitoring your conversion events."
          />
        }
      />
    </div>
  );
}
