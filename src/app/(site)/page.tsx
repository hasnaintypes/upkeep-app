import {
  CTASection,
  ContentSection,
  CoreFeaturesSection,
  FAQSection,
  FeaturesSection,
  HeroSection,
  HowItWorksSection,
  SupportedHostsSection,
} from "@/features/marketing";

export default function Home() {
  return (
    <>
      <HeroSection />
      <SupportedHostsSection />
      <HowItWorksSection />
      <CoreFeaturesSection />
      <FeaturesSection />
      <ContentSection />
      <FAQSection />
      <CTASection />
    </>
  );
}
