import {
  CTASection,
  ContentSection,
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
      <FeaturesSection />
      <ContentSection />
      <FAQSection />
      <CTASection />
    </>
  );
}
