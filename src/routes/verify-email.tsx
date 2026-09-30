import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { z } from "zod";
import { AuthShell } from "@/components/pixora/auth-shell";
import { Button } from "@/components/ui/button";
import { verifyEmailFn } from "@/lib/auth/functions";

const verifyEmailSearchSchema = z.object({
  token: z.string().optional(),
});

export const Route = createFileRoute("/verify-email")({
  validateSearch: verifyEmailSearchSchema,
  head: () => ({
    meta: [
      { title: "Verify your email — Pixora AI" },
      { name: "description", content: "Confirm your email address for Pixora AI." },
    ],
  }),
  component: VerifyEmailPage,
});

type State = "verifying" | "success" | "error" | "missing";

function VerifyEmailPage() {
  const { token } = Route.useSearch();
  const [state, setState] = useState<State>(token ? "verifying" : "missing");
  const [message, setMessage] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    verifyEmailFn({ data: token })
      .then((result) => {
        if (result.success) {
          setState("success");
        } else {
          setState("error");
          setMessage(result.message);
        }
      })
      .catch(() => {
        setState("error");
        setMessage("Something went wrong. Please try again.");
      });
  }, [token]);

  return (
    <AuthShell
      title="Verify your email"
      subtitle="Confirming your Pixora AI account."
      footer={
        <Link to="/login" className="text-primary hover:underline">
          Back to log in
        </Link>
      }
    >
      <div className="surface-panel flex flex-col items-center px-6 py-10 text-center">
        {state === "verifying" ? (
          <>
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="mt-4 text-sm text-foreground">Verifying your email…</p>
          </>
        ) : null}
        {state === "success" ? (
          <>
            <CheckCircle2 className="size-8 text-primary" />
            <p className="mt-4 text-sm text-foreground">Email verified</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your email address has been confirmed.
            </p>
            <Button asChild className="mt-6">
              <Link to="/studio">Go to Studio</Link>
            </Button>
          </>
        ) : null}
        {state === "error" ? (
          <>
            <XCircle className="size-8 text-destructive" />
            <p className="mt-4 text-sm text-foreground">Verification failed</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {message ?? "This verification link is invalid or has expired."}
            </p>
            <Button asChild variant="outline" className="mt-6">
              <Link to="/settings">Request a new link</Link>
            </Button>
          </>
        ) : null}
        {state === "missing" ? (
          <>
            <XCircle className="size-8 text-destructive" />
            <p className="mt-4 text-sm text-foreground">No verification token</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This link is missing its verification token. Check the link from your email, or
              request a new one from Settings.
            </p>
          </>
        ) : null}
      </div>
    </AuthShell>
  );
}
