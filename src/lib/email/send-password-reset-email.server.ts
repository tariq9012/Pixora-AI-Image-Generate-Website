import { env } from "@/lib/env.server";

import { sendEmail } from "./client.server";
import { passwordResetEmailTemplate } from "./templates";

export async function sendPasswordResetEmail(to: string, rawToken: string): Promise<void> {
  const resetUrl = `${env.APP_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;
  const { subject, html, text } = passwordResetEmailTemplate(resetUrl);

  const result = await sendEmail({ to, subject, html, text });

  if (!result.delivered) {
    console.log(`[reset-password] dev fallback link for ${to}: ${resetUrl}`);
  }
}
