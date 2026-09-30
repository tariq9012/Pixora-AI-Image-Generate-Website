function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#0b0b10;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#16161f;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:32px;color:#e8e8ef;">
          <p style="margin:0 0 24px;font-size:18px;font-weight:600;color:#fff;">Pixora AI</p>
          <h1 style="margin:0 0 16px;font-size:20px;color:#fff;">${title}</h1>
          ${bodyHtml}
          <p style="margin:32px 0 0;font-size:12px;color:#8a8a9a;">
            If you didn't request this, you can safely ignore this email.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;margin:8px 0 4px;padding:12px 24px;background:#7c5cff;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">${label}</a>`;
}

export function verificationEmailTemplate(verifyUrl: string) {
  return {
    subject: "Verify your email for Pixora AI",
    html: layout(
      "Confirm your email address",
      `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#c4c4d1;">
         Click below to verify your email and finish setting up your Pixora AI account. This link expires in 24 hours.
       </p>
       ${button(verifyUrl, "Verify email")}
       <p style="margin:20px 0 0;font-size:12px;color:#8a8a9a;word-break:break-all;">${verifyUrl}</p>`,
    ),
    text: `Confirm your email address for Pixora AI.\n\nOpen this link (expires in 24 hours):\n${verifyUrl}\n\nIf you didn't request this, you can ignore this email.`,
  };
}

export function passwordResetEmailTemplate(resetUrl: string) {
  return {
    subject: "Reset your Pixora AI password",
    html: layout(
      "Reset your password",
      `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#c4c4d1;">
         We received a request to reset your Pixora AI password. This link expires in 45 minutes.
       </p>
       ${button(resetUrl, "Reset password")}
       <p style="margin:20px 0 0;font-size:12px;color:#8a8a9a;word-break:break-all;">${resetUrl}</p>`,
    ),
    text: `Reset your Pixora AI password.\n\nOpen this link (expires in 45 minutes):\n${resetUrl}\n\nIf you didn't request this, you can ignore this email — your password will stay the same.`,
  };
}
