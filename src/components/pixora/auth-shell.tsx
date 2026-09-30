import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Logo } from "./logo";
import { IMAGES } from "@/lib/mock-data";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      <div className="relative flex flex-col justify-center px-5 py-10 sm:px-10 lg:px-16">
        <div className="pointer-events-none absolute inset-0 hero-glow opacity-60 lg:hidden" />
        <div className="relative mx-auto w-full max-w-sm">
          <Logo className="mb-10" />
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            {title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-6 text-sm text-muted-foreground">{footer}</div> : null}
          <p className="mt-10 text-xs text-muted-foreground">
            <Link to="/" className="transition-colors hover:text-foreground">
              ← Back to pixora.ai
            </Link>
          </p>
        </div>
      </div>

      <div className="relative hidden overflow-hidden border-l border-border lg:block">
        <img
          src={IMAGES.city}
          alt="AI generated cityscape created with Pixora AI"
          className="size-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-12">
          <p className="font-display text-2xl font-semibold text-foreground">
            Turn your imagination into images.
          </p>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Cinematic futuristic city at sunset · Pixora Pro · 4K
          </p>
        </div>
      </div>
    </div>
  );
}
