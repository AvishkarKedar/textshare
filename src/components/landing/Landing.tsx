"use client";

import { Hero } from "./Hero";
import { StatsStrip } from "./StatsStrip";
import { UseCases } from "./UseCases";
import { HowItWorks } from "./HowItWorks";
import { FAQ } from "./FAQ";
import { CtaBanner } from "./CtaBanner";
import { LandingFooter } from "./LandingFooter";
import { Reveal } from "./Reveal";

export function Landing() {
  return (
    // overflow-x-clip: hard guard against any 1px horizontal drift from
    // decorative glows/wide grids on small viewports (clip, not hidden —
    // no scroll container is created).
    <main className="flex min-h-screen flex-col overflow-x-clip">
      <Hero />
      <Reveal>
        <StatsStrip />
      </Reveal>
      <Reveal delay={0.05}>
        <HowItWorks />
      </Reveal>
      <Reveal>
        <UseCases />
      </Reveal>
      <Reveal delay={0.05}>
        <FAQ />
      </Reveal>
      <Reveal>
        <CtaBanner />
      </Reveal>
      <LandingFooter />
    </main>
  );
}
