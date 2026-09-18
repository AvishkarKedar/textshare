"use client";

import { Hero } from "./Hero";
import { StatsStrip } from "./StatsStrip";
import { UseCases } from "./UseCases";
import { HowItWorks } from "./HowItWorks";
import { FAQ } from "./FAQ";
import { CtaBanner } from "./CtaBanner";
import { LandingFooter } from "./LandingFooter";

export function Landing() {
  return (
    <div className="flex min-h-screen flex-col">
      <Hero />
      <StatsStrip />
      <UseCases />
      <HowItWorks />
      <FAQ />
      <CtaBanner />
      <LandingFooter />
    </div>
  );
}
