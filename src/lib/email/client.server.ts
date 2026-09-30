import { Resend } from "resend";

import { env } from "@/lib/env.server";

let cachedClient: Resend | null | undefined;

function getResendClient(): Resend | null {
  if (cachedClient !== undefined) return cachedClient;
  cachedClient = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
  return cachedClient;
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendEmailResult = { delivered: true } | { delivered: false; reason: "dev-fallback" };

/**
 * Sends through Resend when `RESEND_API_KEY` + `EMAIL_FROM` are configured.
 *
 * Otherwise — and ONLY then — falls back to logging the email's contents
 * (including the verification/reset URL) to the server console so auth
 * flows stay fully testable without real email credentials. This is a
 * deliberate, documented development fallback, never a silently-faked
 * success: it always reports `delivered: false` back to the caller, and a
 * configured provider that actually fails to send throws instead of
 * pretending to have delivered anything.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const client = getResendClient();

  if (!client || !env.EMAIL_FROM) {
    // PHASE 14: never act like real email in production, and never print
    // verification/reset links (which contain live tokens) into production
    // logs. env.server.ts already refuses to boot in production without
    // RESEND_API_KEY + EMAIL_FROM; this is defense in depth.
    if (env.NODE_ENV === "production") {
      throw new Error("Email delivery is not configured.");
    }
    console.log(
      `\n[dev email fallback — no RESEND_API_KEY/EMAIL_FROM configured]\n` +
        `To: ${input.to}\nSubject: ${input.subject}\n\n${input.text}\n`,
    );
    return { delivered: false, reason: "dev-fallback" };
  }

  const result = await client.emails.send({
    from: env.EMAIL_FROM,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  if (result.error) {
    throw new Error(`Failed to send email via Resend: ${result.error.message}`);
  }

  return { delivered: true };
}
