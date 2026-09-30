import { env } from "@/lib/env.server";

import { sendEmail } from "./client.server";
import { verificationEmailTemplate } from "./templates";

export async function sendVerificationEmail(to: string, rawToken: string): Promise<void> {
  const verifyUrl = `${env.APP_URL}/verify-email?token=${encodeURIComponent(rawToken)}`;
  const { subject, html, text } = verificationEmailTemplate(verifyUrl);

  const result = await sendEmail({ to, subject, html, text });

  if (!result.delivered) {
    console.log(`[verify-email] dev fallback link for ${to}: ${verifyUrl}`);
  }
}
