import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  Crop,
  Eraser,
  Expand,
  Image as ImageIcon,
  Layers,
  Pencil,
  Quote,
  Sparkles,
  Star,
  Wand2,
} from "lucide-react";
import { PublicShell } from "@/components/pixora/public-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  CREATIONS,
  FAQS,
  FEATURES,
  IMAGES,
  MODELS,
  PLANS,
  POPULAR_PROMPTS,
  TESTIMONIALS,
  USE_CASES,
} from "@/lib/mock-data";
import { ImageCard } from "@/components/pixora/image-card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pixora AI — Turn your imagination into images" },
      {
        name: "description",
        content:
          "Create stunning AI-generated images, edit existing visuals and bring your imagination to life with Pixora AI.",
      },
      { property: "og:title", content: "Pixora AI — Turn your imagination into images" },
      {
        property: "og:description",
        content: "Create, edit, remix and enhance stunning visuals with AI.",
      },
    ],
  }),
  component: Landing,
});

const FEATURE_ICONS = [Sparkles, ImageIcon, Pencil, Layers, Eraser, Wand2, Expand, Crop];

function Section({
  id,
  eyebrow,
  title,
  subtitle,
  children,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-border/50 py-20 sm:py-24">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-2xl">
          {eyebrow ? (
            <p className="mb-3 text-xs uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
          ) : null}
          <h2 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
            {title}
          </h2>
          {subtitle ? <p className="mt-3 text-muted-foreground">{subtitle}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

function Landing() {
  const [prompt, setPrompt] = useState("");
  const navigate = useNavigate();

  return (
    <PublicShell>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 hero-glow" />
        <div className="relative mx-auto w-full max-w-7xl px-4 pb-16 pt-20 sm:px-6 sm:pt-28 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline" className="mb-6 border-primary/30 bg-primary/10 text-primary">
              <Sparkles className="mr-1.5 size-3.5" /> Pixora Pro v3 is here
            </Badge>
            <h1 className="font-display text-4xl font-bold leading-[1.05] text-foreground sm:text-6xl lg:text-7xl">
              Turn your imagination <span className="text-gradient">into images.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
              Create stunning AI-generated images, edit existing visuals, explore creative ideas,
              and bring your imagination to life.
            </p>
          </div>

          <div className="mx-auto mt-10 max-w-3xl">
            <div className="rounded-2xl border border-border bg-card/80 p-3 shadow-elevated backdrop-blur transition-colors focus-within:border-primary/50">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={2}
                placeholder="Describe what you want to create..."
                className="resize-none border-0 bg-transparent p-2 text-base shadow-none focus-visible:ring-0"
              />
              <div className="flex flex-col gap-2 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="px-2 text-xs text-muted-foreground">
                  Pixora Pro · 1024 · 8 credits per image
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button variant="outline" asChild>
                    <Link to="/explore">Explore Gallery</Link>
                  </Button>
                  <Button onClick={() => navigate({ to: "/studio" })}>
                    <Sparkles className="size-4" /> Generate Free
                  </Button>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {POPULAR_PROMPTS.slice(0, 4).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPrompt(p)}
                  className="rounded-full border border-border bg-card/60 px-3.5 py-1.5 text-xs text-muted-foreground transition-all hover:border-primary/40 hover:text-foreground"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Showcase */}
          <div className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[IMAGES.city, IMAGES.fashion, IMAGES.castle, IMAGES.street].map((src, i) => (
              <div
                key={src}
                className={`overflow-hidden rounded-2xl border border-border shadow-elevated ${
                  i % 2 === 1 ? "sm:translate-y-8" : ""
                }`}
              >
                <img
                  src={src}
                  alt="AI generated artwork made with Pixora AI"
                  className="aspect-[3/4] w-full object-cover transition-transform duration-700 hover:scale-105"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Showcase grid */}
      <Section
        eyebrow="AI Creation Showcase"
        title="Made entirely with Pixora AI"
        subtitle="Every image below started as a single sentence."
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {CREATIONS.slice(0, 8).map((c) => (
            <ImageCard key={c.id} item={c} />
          ))}
        </div>
      </Section>

      {/* Popular prompts */}
      <Section
        eyebrow="Popular Prompts"
        title="Start from something people love"
        subtitle="Tap a prompt to open it in the studio."
      >
        <div className="flex flex-wrap gap-3">
          {POPULAR_PROMPTS.map((p) => (
            <Link
              key={p}
              to="/studio"
              className="group inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-glow"
            >
              {p}
              <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </Link>
          ))}
        </div>
      </Section>

      {/* Featured creations */}
      <Section
        eyebrow="Featured Creations"
        title="This week's standouts"
        subtitle="Hand-picked by the Pixora editorial team."
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {CREATIONS.slice(0, 3).map((c) => (
            <article
              key={c.id}
              className="group overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-all hover:border-primary/40 hover:shadow-elevated"
            >
              <img
                src={c.src}
                alt={c.prompt}
                loading="lazy"
                className="aspect-[4/5] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
              <div className="p-5">
                <p className="line-clamp-2 text-sm text-foreground">{c.prompt}</p>
                <div className="mt-4 flex items-center gap-3">
                  <img src={c.avatar} alt="" className="size-8 rounded-full object-cover" />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">{c.creator}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.model} · {c.likes.toLocaleString()} likes
                    </p>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </Section>

      {/* Use cases */}
      <Section eyebrow="Use Cases" title="One studio, every brief">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {USE_CASES.map((u) => (
            <div
              key={u.title}
              className="surface-panel p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40"
            >
              <h3 className="font-display text-base font-semibold text-foreground">{u.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{u.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Models */}
      <Section
        eyebrow="AI Models"
        title="Pick the engine that fits the job"
        subtitle="Switch models mid-project without losing your settings."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODELS.map((m) => (
            <div key={m.id} className="surface-panel flex flex-col p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-semibold text-foreground">{m.name}</h3>
                <Badge variant="outline" className="border-primary/30 text-primary">
                  {m.badge}
                </Badge>
              </div>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{m.desc}</p>
              <p className="mt-4 text-xs text-muted-foreground">
                {m.cost} credits · {m.speed} average
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* Features */}
      <Section
        id="features"
        eyebrow="Features"
        title="Everything you need after the first image"
        subtitle="Generation is the start. Pixora carries the work all the way to final."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => {
            const Icon = FEATURE_ICONS[i % FEATURE_ICONS.length]!;
            return (
              <div
                key={f.title}
                className="surface-panel p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40"
              >
                <div className="mb-4 grid size-10 place-items-center rounded-xl border border-border bg-background">
                  <Icon className="size-5 text-primary" />
                </div>
                <h3 className="font-display text-base font-semibold text-foreground">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Pricing preview */}
      <Section
        eyebrow="Pricing"
        title="Plans that scale with your output"
        subtitle="Start free. Upgrade when the work does."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`surface-panel flex flex-col p-6 ${
                p.highlight ? "border-primary/50 shadow-glow" : ""
              }`}
            >
              <h3 className="font-display text-lg font-semibold text-foreground">{p.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
              <p className="mt-4 font-display text-3xl font-semibold text-foreground">
                {p.price === null ? "Custom" : `$${p.price}`}
                {p.price !== null ? (
                  <span className="text-sm font-normal text-muted-foreground">/month</span>
                ) : null}
              </p>
              <ul className="mt-5 flex-1 space-y-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button asChild variant={p.highlight ? "default" : "outline"} className="mt-6 w-full">
                <Link to="/pricing">{p.cta}</Link>
              </Button>
            </div>
          ))}
        </div>
      </Section>

      {/* Testimonials */}
      <Section eyebrow="Testimonials" title="Teams that stopped waiting on shoots">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <figure key={t.name} className="surface-panel flex flex-col p-6">
              <Quote className="size-6 text-primary" />
              <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-foreground">
                {t.quote}
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3">
                <img
                  src={t.avatar}
                  alt=""
                  loading="lazy"
                  className="size-10 rounded-full object-cover"
                />
                <div>
                  <p className="text-sm text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </figcaption>
              <div className="mt-4 flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="size-3.5 fill-primary text-primary" />
                ))}
              </div>
            </figure>
          ))}
        </div>
      </Section>

      {/* FAQ */}
      <Section eyebrow="FAQ" title="Questions, answered">
        <Accordion type="single" collapsible className="max-w-3xl">
          {FAQS.map((f) => (
            <AccordionItem key={f.q} value={f.q} className="border-border">
              <AccordionTrigger className="text-left text-base text-foreground">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Section>

      {/* Final CTA */}
      <section className="relative overflow-hidden border-t border-border/50 py-24">
        <div className="pointer-events-none absolute inset-0 hero-glow" />
        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="font-display text-3xl font-semibold text-foreground sm:text-5xl">
            Your next creation starts with a prompt.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Free to start. No card required. 50 credits on the house.
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link to="/studio">
              Start Creating <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </PublicShell>
  );
}
