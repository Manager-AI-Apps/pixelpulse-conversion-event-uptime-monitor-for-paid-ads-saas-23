import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LayoutDashboard, Building2 } from "lucide-react";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPropertyStats } from "@/lib/queries/dashboard";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/blocks/page-header";
import { DashboardContent } from "./_components/dashboard-content";

const NAV = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: <LayoutDashboard className="size-4" />,
  },
  {
    title: "Properties",
    href: "/properties",
    icon: <Building2 className="size-4" />,
  },
];

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?next=/dashboard");

  // Fetch 7-day and 30-day uptime concurrently.
  const [stats7d, stats30d] = await Promise.all([
    getPropertyStats(session.user.id, 7, db),
    getPropertyStats(session.user.id, 30, db),
  ]);

  return (
    <AppShell
      appName="PixelPulse"
      nav={NAV}
      header={<PageHeader title="Dashboard" />}
    >
      <DashboardContent stats7d={stats7d} stats30d={stats30d} />
    </AppShell>
  );
}
