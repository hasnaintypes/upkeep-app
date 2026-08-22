import { Reveal } from "./reveal";
import { HOW_IT_WORKS_CONTENT, HOW_IT_WORKS_STEPS } from "../constants/how-it-works";

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-16 md:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <Reveal>
          <h2 className="text-foreground text-4xl font-semibold">
            {HOW_IT_WORKS_CONTENT.heading}
          </h2>
          <p className="text-muted-foreground mt-4 max-w-xl text-balance text-lg">
            {HOW_IT_WORKS_CONTENT.description}
          </p>
        </Reveal>

        <ol className="relative mt-16 grid gap-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {HOW_IT_WORKS_STEPS.map((step, index) => (
            <li key={step.title} className="relative">
              <Reveal delay={index * 120}>
                <div className="border-foreground/10 flex flex-col gap-3 border-l pl-6 lg:border-l-0 lg:pl-0">
                  <span
                    aria-hidden
                    className="text-foreground/10 select-none text-6xl font-bold lg:text-7xl"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-foreground text-lg font-semibold">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground text-balance">
                    {step.description}
                  </p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
