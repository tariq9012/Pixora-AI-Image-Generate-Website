import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function GoogleButton({ label }: { label: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={() => toast.info("Google sign-in arrives in the next phase")}
    >
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
        <path
          fill="currentColor"
          d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.63 4.1-5.35 4.1-3.22 0-5.85-2.66-5.85-5.94s2.63-5.94 5.85-5.94c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.7 3.72 14.6 2.8 12 2.8 6.98 2.8 2.9 6.88 2.9 11.9S6.98 21 12 21c5.5 0 9.14-3.87 9.14-9.32 0-.63-.07-1.1-.16-1.58z"
        />
      </svg>
      {label}
    </Button>
  );
}
