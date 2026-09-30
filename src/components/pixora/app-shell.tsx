import { Link, useRouteContext, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  ChevronLeft,
  Coins,
  Compass,
  Crop,
  Eraser,
  Expand,
  Heart,
  History,
  Image as ImageIcon,
  LayoutGrid,
  Menu,
  Pencil,
  Search,
  Settings,
  Sparkles,
  User,
  Wand2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Logo } from "./logo";
import { IMAGES } from "@/lib/mock-data";
import { getBillingSummaryFn } from "@/lib/billing/functions";
import { logOutFn, resendVerificationFn } from "@/lib/auth/functions";
import { toast } from "sonner";

const GROUPS = [
  {
    label: "Create",
    items: [
      { to: "/studio", label: "Studio", icon: Sparkles },
      { to: "/image-to-image", label: "Image to Image", icon: ImageIcon },
      { to: "/editor", label: "Editor", icon: Pencil },
      { to: "/upscale", label: "Upscale", icon: Wand2 },
      { to: "/remove-background", label: "Remove Background", icon: Eraser },
      { to: "/expand", label: "Expand", icon: Expand },
    ],
  },
  {
    label: "Library",
    items: [
      { to: "/creations", label: "My Creations", icon: LayoutGrid },
      { to: "/history", label: "History", icon: History },
      { to: "/projects", label: "Projects", icon: Crop },
      { to: "/favorites", label: "Favorites", icon: Heart },
    ],
  },
  {
    label: "Community",
    items: [{ to: "/explore", label: "Explore", icon: Compass }],
  },
  {
    label: "Account",
    items: [
      { to: "/profile", label: "Profile", icon: User },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
] as const;

function SidebarBody({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // PHASE 13: real balance/plan, replacing the previous hardcoded
  // `CREDITS = 1250` constant and "Creator plan · renews Oct 1" string —
  // shared react-query cache means this and AppShell's header badge
  // below both read the same in-flight/cached request, not two calls.
  const billingQuery = useQuery({
    queryKey: ["billing-summary"],
    queryFn: () => getBillingSummaryFn(),
  });
  const balance = billingQuery.data?.balance ?? 0;
  const planName = billingQuery.data?.subscription?.planName ?? "Free";

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-16 items-center px-4", collapsed && "justify-center px-0")}>
        {collapsed ? (
          <Link to="/studio" aria-label="Pixora AI studio">
            <span className="grid size-8 place-items-center rounded-[10px] bg-[image:var(--gradient-primary)]">
              <span className="size-3 rounded-[4px] bg-primary-foreground/90" />
            </span>
          </Link>
        ) : (
          <Logo to="/studio" />
        )}
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {GROUPS.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="mb-2 px-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.to;
                const link = (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={onNavigate}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm transition-all",
                      collapsed && "justify-center px-0",
                      active
                        ? "bg-primary/12 text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_25%,transparent)]"
                        : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                    )}
                  >
                    <item.icon className="size-[18px] shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
                return collapsed ? (
                  <Tooltip key={item.to}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                ) : (
                  link
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={cn("border-t border-sidebar-border p-3", collapsed && "px-2")}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/credits"
                className="grid size-10 place-items-center rounded-xl border border-border text-primary"
              >
                <Coins className="size-[18px]" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{balance.toLocaleString()} Credits</TooltipContent>
          </Tooltip>
        ) : (
          <div className="surface-panel p-3.5">
            <div className="flex items-center gap-2 text-sm">
              <Coins className="size-4 text-primary" />
              <span className="font-medium text-foreground">
                {balance.toLocaleString()} Credits
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{planName} plan</p>
            <Button asChild size="sm" className="mt-3 w-full">
              <Link to="/pricing" onClick={onNavigate}>
                Upgrade
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function AppShell({
  children,
  title,
  description,
  actions,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
  actions?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const { user } = useRouteContext({ from: "__root__" });
  // Shares react-query's cache with SidebarBody's identical query above —
  // one network request serves both.
  const headerBillingQuery = useQuery({
    queryKey: ["billing-summary"],
    queryFn: () => getBillingSummaryFn(),
  });

  const displayName = user?.name?.trim() || user?.email || "Account";
  const displayHandle = user?.username ? `@${user.username}` : user?.email;

  const handleLogout = async () => {
    try {
      await logOutFn();
    } finally {
      // Full reload clears every client-held bit of derived auth state
      // (root context's `user`, etc.) along with the now-invalid session.
      window.location.assign("/");
    }
  };

  const handleResendVerification = async () => {
    setResendingVerification(true);
    try {
      const result = await resendVerificationFn();
      if (result.success) {
        toast.success("Verification email sent — check your inbox");
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setResendingVerification(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-300 lg:block",
          collapsed ? "w-[76px]" : "w-[264px]",
        )}
      >
        <SidebarBody collapsed={collapsed} />
        <button
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setCollapsed((v) => !v)}
          className="absolute -right-3 top-20 grid size-6 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className={cn("size-3.5 transition-transform", collapsed && "rotate-180")} />
        </button>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[280px] border-sidebar-border bg-sidebar p-0">
          <SidebarBody collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div
        className={cn(
          "flex min-h-screen flex-col transition-[padding] duration-300",
          collapsed ? "lg:pl-[76px]" : "lg:pl-[264px]",
        )}
      >
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 glass px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" />
          </Button>

          <div className="relative hidden max-w-sm flex-1 md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search creations, projects, prompts..." className="pl-9" />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/credits"
              className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/50 sm:inline-flex"
            >
              <Coins className="size-3.5 text-primary" />
              {(headerBillingQuery.data?.balance ?? 0).toLocaleString()}
            </Link>
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell className="size-[18px]" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Account menu"
                  className="size-9 overflow-hidden rounded-full border border-border transition-colors hover:border-primary/60"
                >
                  <img
                    src={user?.avatarUrl || IMAGES.portrait}
                    alt=""
                    className="size-full object-cover"
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>
                  <span className="block truncate text-sm text-foreground">{displayName}</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">
                    {displayHandle}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profile">Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/credits">Credits</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/settings">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    void handleLogout();
                  }}
                >
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {user && !user.emailVerified ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-600 sm:px-6">
            <span>Please verify your email address to secure your account.</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-amber-600 underline hover:text-amber-600"
              onClick={() => void handleResendVerification()}
              disabled={resendingVerification}
            >
              {resendingVerification ? "Sending…" : "Resend verification email"}
            </Button>
          </div>
        ) : null}

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {title ? (
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
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
