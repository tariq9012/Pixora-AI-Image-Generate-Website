import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { AuthShell } from "@/components/pixora/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordFn } from "@/lib/auth/functions";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your password — Pixora AI" },
      { name: "description", content: "Request a password reset link for your Pixora AI account." },
      { property: "og:title", content: "Reset your password — Pixora AI" },
      { property: "og:description", content: "Request a password reset link." },
    ],
  }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      // Always resolves successfully — the server intentionally never
      // reveals whether an account exists for this email.
      await forgotPasswordFn({ data: { email } });
    } finally {
      setBusy(false);
      setSent(true);
    }
  };

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="We'll email you a link to set a new one."
      footer={
        <Link to="/login" className="text-primary hover:underline">
          Back to log in
        </Link>
      }
    >
      {sent ? (
        <div className="surface-panel flex flex-col items-center px-6 py-10 text-center">
          <MailCheck className="size-8 text-primary" />
          <p className="mt-4 text-sm text-foreground">Check your inbox</p>
          <p className="mt-1 text-sm text-muted-foreground">
            If that address has an account, a reset link is on its way.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
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
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
