import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createProperty } from "@/lib/actions/properties";
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

export default async function NewPropertyPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in?next=/properties/new");

  async function handleCreate(formData: FormData) {
    "use server";

    const sessionInner = await auth.api.getSession({
      headers: await headers(),
    });
    if (!sessionInner) throw new Error("Unauthorized");

    const name = (formData.get("name") as string | null)?.trim() ?? "";
    const domain = (formData.get("domain") as string | null)?.trim() ?? "";
    const ga4MeasurementId =
      (formData.get("ga4MeasurementId") as string | null)?.trim() || undefined;
    const metaPixelId =
      (formData.get("metaPixelId") as string | null)?.trim() || undefined;
    const stripePublishableKey =
      (formData.get("stripePublishableKey") as string | null)?.trim() ||
      undefined;

    if (!name) throw new Error("Property name is required.");
    if (!domain) throw new Error("Domain is required.");

    const prop = await createProperty(db, sessionInner.user.id, {
      name,
      domain,
      ga4MeasurementId,
      metaPixelId,
      stripePublishableKey,
    });

    redirect(`/properties/${prop.id}/funnels`);
  }

  return (
    <AppShell
      appName="PixelPulse"
      nav={NAV}
      header={<PageHeader title="Add property" />}
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          title="Add a property"
          description="Connect a website to start monitoring its conversion events."
        />

        <Card className="rounded-xl border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="font-display text-xl font-medium">
              Property details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={handleCreate} className="space-y-5">
              {/* Name */}
              <div className="space-y-1.5">
                <Label htmlFor="name">Property name</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="My SaaS App"
                  required
                  autoFocus
                />
                <p className="text-sm text-muted-foreground">
                  A friendly label — only you see this.
                </p>
              </div>

              {/* Domain */}
              <div className="space-y-1.5">
                <Label htmlFor="domain">Domain</Label>
                <Input
                  id="domain"
                  name="domain"
                  placeholder="https://app.example.com"
                  type="url"
                  required
                />
                <p className="text-sm text-muted-foreground">
                  The root URL of your site (e.g. https://app.example.com).
                </p>
              </div>

              {/* Optional tracking IDs */}
              <div className="rounded-lg border border-dashed p-4 space-y-4">
                <p className="text-sm font-medium text-muted-foreground">
                  Tracking IDs (optional — add any you use)
                </p>

                <div className="space-y-1.5">
                  <Label htmlFor="ga4MeasurementId">
                    GA4 Measurement ID
                  </Label>
                  <Input
                    id="ga4MeasurementId"
                    name="ga4MeasurementId"
                    placeholder="G-XXXXXXXXXX"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="metaPixelId">Meta Pixel ID</Label>
                  <Input
                    id="metaPixelId"
                    name="metaPixelId"
                    placeholder="123456789012345"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="stripePublishableKey">
                    Stripe Publishable Key
                  </Label>
                  <Input
                    id="stripePublishableKey"
                    name="stripePublishableKey"
                    placeholder="pk_live_..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  formAction="/properties"
                >
                  Cancel
                </Button>
                <Button type="submit">Create property</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
