import { SiteNav } from "@/components/site/SiteNav";
import { Hero } from "@/components/site/Hero";
import { LiveTicker } from "@/components/site/LiveTicker";
import { HowItWorks } from "@/components/site/HowItWorks";
import { Pricing } from "@/components/site/Pricing";
import { Agents } from "@/components/site/Agents";
import { Architecture } from "@/components/site/Architecture";
import { Developers } from "@/components/site/Developers";
import { Faq } from "@/components/site/Faq";
import { SiteFooter } from "@/components/site/SiteFooter";

export default function Landing() {
  return (
    <>
      <SiteNav />
      <main>
        <Hero />
        <LiveTicker />
        <HowItWorks />
        <Pricing />
        <Agents />
        <Architecture />
        <Developers />
        <Faq />
      </main>
      <SiteFooter />
    </>
  );
}
