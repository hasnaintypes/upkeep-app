import { HeroSection } from "./hero-section";
import { LogoCloud } from "./logo-cloud";
import { FeatureCardsSection } from "./feature-cards-section";
import { AISection } from "./ai-section";
import { ProductDirectionSection } from "./product-direction-section";
import { WorkflowsSection } from "./workflows-section";
import { CTASection } from "./cta-section";

export function MarketingPage() {
  return (
    <div style={{ backgroundColor: "#09090B" }}>
      <HeroSection />
      <LogoCloud />
      <FeatureCardsSection />
      <AISection />
      <ProductDirectionSection />
      <WorkflowsSection />
      <CTASection />
    </div>
  );
}
