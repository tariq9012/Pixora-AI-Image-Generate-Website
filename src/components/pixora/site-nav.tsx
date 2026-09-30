import { Link, useRouteContext } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "./logo";
import { logOutFn } from "@/lib/auth/functions";

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const { user } = useRouteContext({ from: "__root__" });

  const handleLogout = async () => {
    try {
      await logOutFn();
    } finally {
      window.location.assign("/");
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 glass">
      <nav className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo />

        <div className="hidden items-center gap-1 md:flex">
          <Link
            to="/explore"
            className="rounded-lg px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            activeProps={{ className: "text-foreground" }}
          >
            Explore
          </Link>
          <Link
            to="/"
            hash="features"
            className="rounded-lg px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Features
          </Link>
          <Link
            to="/pricing"
            className="rounded-lg px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            activeProps={{ className: "text-foreground" }}
          >
            Pricing
          </Link>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <>
              <Button variant="ghost" asChild>
                <Link to="/studio">Go to Studio</Link>
              </Button>
              <Button variant="outline" onClick={() => void handleLogout()}>
                Log out
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link to="/login">Log In</Link>
              </Button>
              <Button asChild>
                <Link to="/signup">Get Started</Link>
              </Button>
            </>
          )}
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[86vw] max-w-sm border-border bg-background p-6">
            <div className="mb-8">
              <Logo />
            </div>
            <div className="flex flex-col gap-1">
              <Link
                to="/explore"
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-3 text-base text-foreground transition-colors hover:bg-accent"
              >
                Explore
              </Link>
              <Link
                to="/"
                hash="features"
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-3 text-base text-foreground transition-colors hover:bg-accent"
              >
                Features
              </Link>
              <Link
                to="/pricing"
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-3 text-base text-foreground transition-colors hover:bg-accent"
              >
                Pricing
              </Link>
            </div>
            <div className="mt-8 flex flex-col gap-2">
              {user ? (
                <>
                  <Button variant="outline" asChild onClick={() => setOpen(false)}>
                    <Link to="/studio">Go to Studio</Link>
                  </Button>
                  <Button
                    onClick={() => {
                      setOpen(false);
                      void handleLogout();
                    }}
                  >
                    Log out
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" asChild onClick={() => setOpen(false)}>
                    <Link to="/login">Log In</Link>
                  </Button>
                  <Button asChild onClick={() => setOpen(false)}>
                    <Link to="/signup">Get Started</Link>
                  </Button>
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </header>
  );
}
