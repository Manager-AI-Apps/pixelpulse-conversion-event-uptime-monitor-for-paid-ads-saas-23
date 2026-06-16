import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Building2, GitBranch, Plus } from "lucide-react";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listProperties } from "@/lib/actions/properties";
import { listFunnels, deleteFunnel } from "@/lib/actions/funnels";
import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/blocks/empty-state";
import { PageHeader } from "@/components/blocks/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const NAV = [
  {
    title: "Properties",
    href: "/properties",
    icon: <Building2 className="size-4" />,
  },
];

export default async function FunnelsPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/sign-in?next=/properties/${propertyId}/funnels`);

  const properties = await listProperties(db, session.user.id);
  const prop = properties.find((p) => p.id === propertyId);
  if (!prop) notFound();

  let funnels: Awaited<ReturnType<typeof listFunnels>> = [];
  try {
    funnels = await listFunnels(db, session.user.id, propertyId);
  } catch {
    notFound();
  }

  async function handleDeleteFunnel(formData: FormData) {
    "use server";
    const s = await auth.api.getSession({ headers: await headers() });
    if (!s) redirect("/sign-in");
    const funnelId = formData.get("funnelId") as string;
    if (!funnelId) return;
    await deleteFunnel(db, s.user.id, funnelId);
    redirect(`/properties/${propertyId}/funnels`);
  }

  return (
    <AppShell
      appName="PixelPulse"
      nav={NAV}
      header={
        <PageHeader title={prop.name} description={prop.domain} />
      }
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          title="Funnels"
          description={`Monitoring funnels for ${prop.name} (${prop.domain})`}
          actions={
            <Button asChild size="sm">
              <Link href={`/properties/${propertyId}/funnels/new`}>
                <Plus className="mr-1.5 size-4" />
                Add funnel
              </Link>
            </Button>
          }
        />

        {funnels.length === 0 ? (
          <EmptyState
            icon={GitBranch}
            title="No funnels recorded yet"
            description="Add a funnel to define the checkout or signup path PixelPulse should monitor on a schedule."
            action={
              <Button asChild size="sm">
                <Link href={`/properties/${propertyId}/funnels/new`}>
                  <Plus className="mr-1.5 size-4" />
                  Add funnel
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Funnel name</TableHead>
                  <TableHead className="text-right">Schedule</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {funnels.map((fn) => (
                  <TableRow key={fn.id} className="hover:bg-muted/40">
                    <TableCell className="font-medium text-foreground">
                      {fn.name}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-sm text-muted-foreground">
                      Every {fn.scheduleMinutes} min
                    </TableCell>
                    <TableCell>
                      {fn.lastRunAt ? (
                        <span className="text-sm text-muted-foreground">
                          {new Date(fn.lastRunAt).toLocaleString()}
                        </span>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          Never run
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <form action={handleDeleteFunnel}>
                        <input type="hidden" name="funnelId" value={fn.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                        >
                          Delete
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
