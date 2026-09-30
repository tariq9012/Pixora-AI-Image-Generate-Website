import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  CreditCard,
  FileText,
  Gauge,
  ImageIcon,
  Layers,
  Menu,
  ScrollText,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Logo } from "./logo";
import { Badge } from "@/components/ui/badge";

const ITEMS = [
  { to: "/admin", label: "Overview", icon: Gauge },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/generations", label: "Generations", icon: ImageIcon },
  { to: "/admin/models", label: "Models", icon: Layers },
  { to: "/admin/moderation", label: "Moderation", icon: ShieldAlert },
  { to: "/admin/payments", label: "Payments", icon: CreditCard },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/admin/reports", label: "Reports", icon: FileText },
  { to: "/admin/logs", label: "Admin Logs", icon: ScrollText },
] as const;

function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 px-4">
        <Logo to="/admin" />
        <Badge variant="outline" className="border-primary/40 text-primary">
          Admin
        </Badge>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {ITEMS.map((item) => {
          const active = pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm transition-all",
                active
                  ? "bg-primary/12 text-primary"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              )}
            >
              <item.icon className="size-[18px]" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <Button variant="outline" asChild className="w-full">
          <Link to="/studio">Back to app</Link>
        </Button>
      </div>
    </div>
  );
}

export function AdminShell({
  children,
  title,
  description,
  actions,
}: {
  children: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] border-r border-sidebar-border bg-sidebar lg:block">
        <AdminNav />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[270px] border-sidebar-border bg-sidebar p-0">
          <AdminNav onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-h-screen flex-col lg:pl-[260px]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 glass px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open admin navigation"
            onClick={() => setOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
          <span className="text-sm text-muted-foreground">Pixora AI · Operations console</span>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
                {title}
              </h1>
              {description ? (
                <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
              ) : null}
            </div>
            {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
