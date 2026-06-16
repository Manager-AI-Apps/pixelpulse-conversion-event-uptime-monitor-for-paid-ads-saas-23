import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Building2, Code2, FileCode } from "lucide-react";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listProperties } from "@/lib/actions/properties";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/blocks/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const NAV = [
  {
    title: "Properties",
    href: "/properties",
    icon: <Building2 className="size-4" />,
  },
];

export default async function SnippetPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/sign-in?next=/properties/${propertyId}/snippet`);

  const properties = await listProperties(db, session.user.id);
  const prop = properties.find((p) => p.id === propertyId);
  if (!prop) notFound();

  const snippetKey = prop.snippetKey;
  const scriptTag = `<script src="/api/ingest/snippet.js?key=${snippetKey}"></script>`;

  const pixelpulseConfig = JSON.stringify(
    {
      snippetKey,
      domain: prop.domain,
      trackPageView: true,
      trackClicks: ["a[href]", "button[type=submit]"],
      trackForms: true,
    },
    null,
    2,
  );

  return (
    <AppShell
      appName="PixelPulse"
      nav={NAV}
      header={<PageHeader title={prop.name} description={prop.domain} />}
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          title="Install snippet"
          description="Add the one-line script to your site so PixelPulse can intercept and verify conversion events in real time."
        />

        {/* One-line script tag */}
        <Card>
          <CardHeader className="space-y-0 pb-3">
            <div className="flex items-center gap-2">
              <Code2 className="size-4 text-muted-foreground" />
              <CardTitle className="text-base font-medium">
                1. Add to your{" "}
                <code className="font-mono text-sm bg-muted px-1 py-0.5 rounded-md">
                  &lt;head&gt;
                </code>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Copy the script tag below and paste it into the{" "}
              <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded-md">
                &lt;head&gt;
              </code>{" "}
              of every page on{" "}
              <span className="font-medium text-foreground">{prop.domain}</span>
              .
            </p>
            <pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-sm leading-relaxed text-foreground">
              {scriptTag}
            </pre>
            <p className="mt-2 text-xs text-muted-foreground">
              Snippet key:{" "}
              <code className="font-mono">{snippetKey}</code>
            </p>
          </CardContent>
        </Card>

        {/* pixelpulse.config.json */}
        <Card>
          <CardHeader className="space-y-0 pb-3">
            <div className="flex items-center gap-2">
              <FileCode className="size-4 text-muted-foreground" />
              <CardTitle className="text-base font-medium">
                2. Commit{" "}
                <code className="font-mono text-sm bg-muted px-1 py-0.5 rounded-md">
                  pixelpulse.config.json
                </code>{" "}
                to your repo
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Save the file below at the root of your project. It tells
              PixelPulse which domain and events to watch — and your engineer
              commits it so it&apos;s tracked in source control.
            </p>
            <pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-sm leading-relaxed text-foreground">
              {pixelpulseConfig}
            </pre>
          </CardContent>
        </Card>

        {/* Verification note */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                Once deployed,
              </span>{" "}
              PixelPulse will automatically detect events on your site within one
              monitoring cycle (≤ 15 minutes). Head back to your funnels to see
              live results.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
