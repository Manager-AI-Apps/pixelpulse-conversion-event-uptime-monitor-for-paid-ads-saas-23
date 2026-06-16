import Link from "next/link";
import { Video, CheckCircle2, Bell } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeatureGrid, type Feature } from "@/components/blocks/feature-grid";
import { Hero } from "@/components/blocks/hero";
import { ThemeToggle } from "@/components/theme-toggle";

const FEATURES: Feature[] = [
  {
    icon: <Video className="size-6" />,
    title: "Visual Funnel Recorder",
    description:
      "Click-record your signup or checkout path once with our Chrome extension. PixelPulse replays it headlessly on a schedule so you never have to set it up again.",
  },
  {
    icon: <CheckCircle2 className="size-6" />,
    title: "Per-Event Assertions",
    description:
      "Define expected GA4, Meta Pixel, Google Ads, and Stripe Purchase events per step — checks name, currency, value, and dedup key so silent misfires get caught instantly.",
  },
  {
    icon: <Bell className="size-6" />,
    title: "Slack Alerts with Diagnosis",
    description:
      "Get a Slack message with exact failure copy: 'Purchase fired without value', 'duplicate via gtag + GTM', or 'CAPI silent fail' — not a generic 'something broke'.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="font-display text-base font-semibold tracking-tight">
          PixelPulse
        </span>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/sign-up">Get started</Link>
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <Hero
        eyebrow={
          <Badge variant="secondary">Conversion event uptime monitoring</Badge>
        }
        title="Stop burning ad spend on a broken pixel"
        subtitle="PixelPulse continuously simulates your signup and checkout flow, then Slacks you the moment your GA4, Meta Pixel, or Stripe Purchase event stops firing — before weeks of wasted spend pile up."
        actions={
          <>
            <Button asChild size="lg">
              <Link href="/sign-up">Start monitoring free</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </>
        }
      />

      <FeatureGrid features={FEATURES} />
    </main>
  );
}
