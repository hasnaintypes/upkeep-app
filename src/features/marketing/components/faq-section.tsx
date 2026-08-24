import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import Link from "next/link";
import { FAQ_CONTENT, FAQ_ITEMS } from "../constants/faq";
import { GITHUB_URL } from "../constants/navigation";
import { Reveal } from "./reveal";

export function FAQSection() {
  return (
    <section id="faq" className="py-24 lg:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid gap-8 md:grid-cols-5 md:gap-12">
          <Reveal className="md:col-span-2">
            <h2 className="text-foreground text-2xl font-semibold tracking-tight md:text-4xl lg:text-5xl">
              {FAQ_CONTENT.heading}
            </h2>
            <p className="text-muted-foreground mt-4 text-balance text-lg">
              {FAQ_CONTENT.subheading}
            </p>
            <p className="text-muted-foreground mt-6 hidden md:block">
              {FAQ_CONTENT.contactPrefix}{" "}
              <Link
                href={`${GITHUB_URL}/issues`}
                target="_blank"
                rel="noreferrer"
                className="text-primary font-medium hover:underline"
              >
                {FAQ_CONTENT.contactLinkText}
              </Link>
            </p>
          </Reveal>

          <Reveal delay={100} className="md:col-span-3">
            <Accordion type="single" collapsible defaultValue={FAQ_ITEMS[0]?.id}>
              {FAQ_ITEMS.map((item) => (
                <AccordionItem key={item.id} value={item.id}>
                  <AccordionTrigger className="cursor-pointer text-base hover:no-underline">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-base">{item.answer}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Reveal>

          <p className="text-muted-foreground mt-6 md:hidden">
            {FAQ_CONTENT.contactPrefix}{" "}
            <Link
              href={`${GITHUB_URL}/issues`}
              target="_blank"
              rel="noreferrer"
              className="text-primary font-medium hover:underline"
            >
              {FAQ_CONTENT.contactLinkText}
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
