import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Plus } from "lucide-react";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listProperties } from "@/lib/actions/properties";
import { AppShell } from "@/components/app-shell";
import { DataTable, type Column } from "@/components/blocks/data-table";
import { EmptyState } from "@/components/blocks/empty-state";
import { PageHeader } from "@/components/blocks/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { PropertyRow } from "@/lib/actions/properties";

const NAV = [
  {
    title: "Properties",
    href: "/properties",
    icon: <Building2 className="size-4" />,
  },
];

const COLUMNS: Column<PropertyRow>[] = [
  {
    key: "name",
    header: "Name",
    cell: (row) => (
      <Link
        href={`/properties/${row.id}/funnels`}
        className="font-medium text-foreground hover:text-primary hover:underline"
      >
        {row.name}
      </Link>
    ),
  },
  {
    key: "domain",
    header: "Domain",
    cell: (row) => (
      <span className="text-sm text-muted-foreground">{row.domain}</span>
    ),
  },
  {
    key: "ga4",
    header: "GA4",
    cell: (row) =>
      row.ga4MeasurementId ? (
        <Badge variant="secondary" className="font-mono text-xs">
          {row.ga4MeasurementId}
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  },
  {
    key: "snippet",
    header: "Snippet Key",
    cell: (row) => (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
        {row.snippetKey.slice(0, 12)}…
      </code>
    ),
  },
  {
    key: "actions",
    header: "",
    cell: (row) => (
      <Button asChild variant="ghost" size="sm">
        <Link href={`/properties/${row.id}/funnels`}>Funnels →</Link>
      </Button>
    ),
  },
];

export default async function PropertiesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?next=/properties");

  const rows = await listProperties(db, session.user.id);

  return (
    <AppShell
      appName="PixelPulse"
      nav={NAV}
      header={<PageHeader title="Properties" />}
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          title="Properties"
          description="Each property is a website you want to monitor for broken conversion events."
          actions={
            <Button asChild size="sm">
              <Link href="/properties/new">
                <Plus className="mr-1.5 size-4" />
                Add property
              </Link>
            </Button>
          }
        />

        <DataTable
          columns={COLUMNS}
          rows={rows}
          getRowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={Building2}
              title="No properties yet"
              description="Add your first property to start monitoring your conversion events."
              action={
                <Button asChild size="sm">
                  <Link href="/properties/new">
                    <Plus className="mr-1.5 size-4" />
                    Add property
                  </Link>
                </Button>
              }
            />
          }
        />
      </div>
    </AppShell>
  );
}
