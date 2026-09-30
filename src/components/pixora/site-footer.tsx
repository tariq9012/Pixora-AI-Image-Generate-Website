import { Link } from "@tanstack/react-router";
import { Logo } from "./logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-surface/40">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="space-y-2">
          <Logo />
          <p className="text-sm text-muted-foreground">Turn your imagination into images.</p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link to="/explore" className="transition-colors hover:text-foreground">
            Explore
          </Link>
          <Link to="/pricing" className="transition-colors hover:text-foreground">
            Pricing
          </Link>
          <Link to="/studio" className="transition-colors hover:text-foreground">
            Studio
          </Link>
          <Link to="/login" className="transition-colors hover:text-foreground">
            Log In
          </Link>
          <Link to="/admin" className="transition-colors hover:text-foreground">
            Admin
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">© 2026 Pixora AI. All rights reserved.</p>
      </div>
    </footer>
  );
}
