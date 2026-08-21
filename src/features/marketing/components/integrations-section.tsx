import { Card } from "@/components/ui/card";
import { INTEGRATIONS_CONTENT, INTEGRATION_CARDS } from "../constants/integrations";
import type { IntegrationCard as IntegrationCardData } from "../types";

export function IntegrationsSection() {
  return (
    <section>
      <div className="py-32">
        <div className="mx-auto max-w-5xl px-6">
          <div>
            <h2 className="text-balance text-3xl font-semibold md:text-4xl">
              {INTEGRATIONS_CONTENT.heading}
            </h2>
            <p className="text-muted-foreground mt-3 text-lg">
              {INTEGRATIONS_CONTENT.description}
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {INTEGRATION_CARDS.map((card) => (
              <IntegrationCard key={card.title} {...card} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const IntegrationCard = ({ title, description, icon: Icon }: IntegrationCardData) => {
  return (
    <Card variant="soft" className="p-6">
      <div className="relative">
        <div>
          <Icon className="size-10" />
        </div>

        <div className="mt-6 space-y-1.5">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-muted-foreground line-clamp-2">{description}</p>
        </div>
      </div>
    </Card>
  );
};
