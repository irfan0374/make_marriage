import {
  ClosingCta,
  FeatureGrid,
  GuestExperience,
  Hero,
  HowItWorks,
  MarketingFooter,
  MarketingHeader,
  Privacy,
} from '@/features/marketing/components/sections';

// Landing page (PRD §5.12). Static: no data, no API calls.
export function MarketingHome() {
  return (
    <>
      <MarketingHeader />
      <main className="flex-1">
        <Hero />
        <FeatureGrid />
        <HowItWorks />
        <GuestExperience />
        <Privacy />
        <ClosingCta />
      </main>
      <MarketingFooter />
    </>
  );
}
