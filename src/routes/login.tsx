import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AuthShell } from "@/components/pixora/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleButton } from "@/components/pixora/google-button";
import { logInFn } from "@/lib/auth/functions";
import { isSafeRedirectTarget, redirectIfAuthenticated } from "@/lib/auth/route-guards";

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
  error: z.enum(["account_banned", "account_suspended"]).optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: loginSearchSchema,
  beforeLoad: ({ context }) => {
    redirectIfAuthenticated(context.user);
  },
  head: () => ({
    meta: [
      { title: "Log in — Pixora AI" },
      { name: "description", content: "Log in to your Pixora AI account and keep creating." },
      { property: "og:title", content: "Log in — Pixora AI" },
      { property: "og:description", content: "Log in to your Pixora AI account." },
    ],
  }),
  component: LoginPage,
});

const ACCOUNT_ERROR_MESSAGES: Record<string, string> = {
  account_banned: "This account has been banned.",
  account_suspended: "This account is currently suspended.",
};

function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const search = Route.useSearch();

  const accountError = search.error ? ACCOUNT_ERROR_MESSAGES[search.error] : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setBusy(true);

    try {
      const result = await logInFn({ data: { email, password } });

      if (!result.success) {
        setFormError(result.message);
        return;
      }

      toast.success("Welcome back");
      const target =
        search.redirect && isSafeRedirectTarget(search.redirect) ? search.redirect : "/studio";
      // Full reload so every server-rendered/loader-derived bit of state
      // (root context's `user`, credit balance, etc.) picks up the new
      // session rather than relying on a client-side router transition.
      window.location.assign(target);
    } catch (error) {
      console.error(error);
      setFormError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to pick up where your last prompt left off."
      footer={
        <>
          Don't have an account?{" "}
          <Link to="/signup" className="text-primary hover:underline">
            Create account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {accountError ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {accountError}
          </p>
        ) : null}
        {formError ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@studio.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Log In
        </Button>
        <div className="relative py-2 text-center">
          <span className="relative z-10 bg-background px-3 text-xs text-muted-foreground">or</span>
          <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
        </div>
        <GoogleButton label="Continue with Google" />
      </form>
    </AuthShell>
  );
}
