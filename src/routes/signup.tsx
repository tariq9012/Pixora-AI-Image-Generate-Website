import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/pixora/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleButton } from "@/components/pixora/google-button";
import { signUpFn } from "@/lib/auth/functions";
import { redirectIfAuthenticated } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/signup")({
  beforeLoad: ({ context }) => {
    redirectIfAuthenticated(context.user);
  },
  head: () => ({
    meta: [
      { title: "Create your account — Pixora AI" },
      {
        name: "description",
        content: "Create a free Pixora AI account and get 50 credits to start generating.",
      },
      { property: "og:title", content: "Create your account — Pixora AI" },
      { property: "og:description", content: "Free to start. 50 credits on the house." },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (password !== confirm) {
      setFormError("Passwords don't match.");
      return;
    }

    setBusy(true);
    try {
      const result = await signUpFn({ data: { name, email, password } });

      if (!result.success) {
        setFormError(result.message);
        return;
      }

      toast.success("Account created — welcome to Pixora AI");
      // Full reload so root context's `user` (and everything derived from
      // it) reflects the session the server just created.
      window.location.assign("/studio");
    } catch (error) {
      console.error(error);
      setFormError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free to start — 50 credits included, no card required."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {formError ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            placeholder="Amir Rahman"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </div>
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm Password</Label>
            <Input
              id="confirm"
              type="password"
              placeholder="••••••••"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Create Account
        </Button>
        <div className="relative py-2 text-center">
          <span className="relative z-10 bg-background px-3 text-xs text-muted-foreground">or</span>
          <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
        </div>
        <GoogleButton label="Sign up with Google" />
      </form>
    </AuthShell>
  );
}
