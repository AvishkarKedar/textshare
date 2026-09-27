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
    <main className="flex min-h-screen flex-col" role="main">
      <Hero />
      <Reveal>
        <StatsStrip />
      </Reveal>
      <Reveal delay={0.05}>
        <UseCases />
      </Reveal>
      <Reveal>
        <HowItWorks />
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
