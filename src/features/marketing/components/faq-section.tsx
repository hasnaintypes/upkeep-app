import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import Link from "next/link";
import { FAQ_CONTENT, FAQ_ITEMS } from "../constants/faq";

export function FAQSection() {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid gap-8 md:grid-cols-5 md:gap-12">
          <div className="md:col-span-2">
            <h2 className="text-foreground text-4xl font-semibold">
              {FAQ_CONTENT.heading}
            </h2>
            <p className="text-muted-foreground mt-4 text-balance text-lg">
              {FAQ_CONTENT.subheading}
            </p>
            <p className="text-muted-foreground mt-6 hidden md:block">
              {FAQ_CONTENT.contactPrefix}{" "}
              <Link href="#" className="text-primary font-medium hover:underline">
                {FAQ_CONTENT.contactLinkText}
              </Link>
            </p>
          </div>

          <div className="md:col-span-3">
            <Accordion type="single" collapsible>
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
          </div>

          <p className="text-muted-foreground mt-6 md:hidden">
            {FAQ_CONTENT.contactPrefix}{" "}
            <Link href="#" className="text-primary font-medium hover:underline">
              {FAQ_CONTENT.contactLinkText}
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
