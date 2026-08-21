import {
  CTASection,
  ContentSection,
  FAQSection,
  FeaturesSection,
  HeroSection,
  IntegrationsSection,
} from "@/features/marketing";

export default function Home() {
  return (
    <>
      <HeroSection />
      <FeaturesSection />
      <ContentSection />
      <IntegrationsSection />
      <FAQSection />
      <CTASection />
    </>
  );
}
