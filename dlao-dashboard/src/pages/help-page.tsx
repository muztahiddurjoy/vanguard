import { Headset, Mail, PhoneCall } from "lucide-react"

import { PriorityBadge } from "@/components/case/priority-badge"
import { PageHeader } from "@/components/layout/page-header"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PRIORITIES } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold">{children}</h2>
}

export function HelpPage() {
  const { t, f } = useI18n()

  const contacts = [
    {
      Icon: PhoneCall,
      label: t.help.contacts.helpline,
      hint: t.help.contacts.helplineHint,
      value: "16430",
      href: "tel:16430",
    },
    {
      Icon: Headset,
      label: t.help.contacts.desk,
      hint: t.help.contacts.deskHint,
      value: "0521-XXXXX",
    },
    // Reserved example domain: not a real address.
    {
      Icon: Mail,
      label: t.help.contacts.support,
      hint: t.help.contacts.supportHint,
      value: "support@dlas.example",
      href: "mailto:support@dlas.example",
    },
  ]

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <PageHeader title={t.help.title} description={t.help.description} />

      <section className="flex flex-col gap-3">
        <SectionTitle>{t.help.startTitle}</SectionTitle>
        <ol className="grid gap-3 md:grid-cols-3">
          {t.help.steps.map((step, i) => (
            <li key={step.title}>
              <Card className="h-full gap-2 px-5 py-5">
                <span
                  aria-hidden
                  className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
                >
                  {f.num(i + 1)}
                </span>
                <h3 className="text-base font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>{t.help.faqTitle}</SectionTitle>
        <Card className="py-0">
          <CardContent className="px-5">
            <Accordion>
              {t.help.faq.map((item, i) => (
                <AccordionItem key={item.q} value={`faq-${i}`}>
                  <AccordionTrigger className="text-[0.9375rem]">{item.q}</AccordionTrigger>
                  <AccordionContent className="max-w-prose text-[0.9375rem] leading-relaxed text-muted-foreground">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>{t.help.priorityTitle}</SectionTitle>
        <Card className="gap-0 py-0">
          <ul className="divide-y">
            {PRIORITIES.map((p) => (
              <li
                key={p}
                className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-6"
              >
                <div className="sm:w-64">
                  <PriorityBadge priority={p} withMeaning />
                </div>
                <p className="text-sm text-muted-foreground">{t.help.priorityExample[p]}</p>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>{t.help.glossaryTitle}</SectionTitle>
        <Card className="py-0">
          <dl className="grid divide-y sm:grid-cols-2 sm:divide-y-0">
            {t.help.glossary.map((g) => (
              <div
                key={g.term}
                className="flex flex-col gap-1 px-5 py-4 sm:border-b sm:odd:border-r"
              >
                <dt className="font-semibold">{g.term}</dt>
                <dd className="text-sm text-muted-foreground">{g.meaning}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>{t.help.contactTitle}</SectionTitle>
        <ul className="grid gap-3 md:grid-cols-3">
          {contacts.map(({ Icon, label, hint, value, href }) => (
            <li key={label}>
              <Card className="h-full gap-3 px-5 py-5">
                <CardHeader className="gap-1 px-0">
                  <span className="mb-1 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <CardTitle className="text-sm font-semibold">
                    <h3>{label}</h3>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">{hint}</p>
                </CardHeader>
                {href ? (
                  <a
                    href={href}
                    className="w-fit rounded-sm font-mono text-base font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {value}
                  </a>
                ) : (
                  <span className="font-mono text-base font-semibold">{value}</span>
                )}
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
