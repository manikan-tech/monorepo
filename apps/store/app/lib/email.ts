import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = "onboarding@resend.dev";

/**
 * Send a 6-digit OTP verification email to the given address.
 */
export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Manikan — Verify your email",
    html: `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; color: #1b3a4b;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="font-size: 24px; font-weight: 600; margin: 0 0 8px 0; color: #1b3a4b;">
            Verify your email
          </h1>
          <p style="font-size: 14px; color: #5a7a8a; margin: 0; line-height: 1.5;">
            Enter the following code in the Manikan activation page to complete your registration.
          </p>
        </div>

        <div style="background: linear-gradient(135deg, #f8f7f4, #f3f7f7); border-radius: 16px; padding: 32px; text-align: center; margin-bottom: 24px; border: 1px solid #e2e8ec;">
          <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: #5a7a8a; margin: 0 0 12px 0;">
            Your verification code
          </p>
          <p style="font-size: 36px; font-weight: 700; letter-spacing: 12px; color: #1b3a4b; margin: 0; font-family: monospace;">
            ${code}
          </p>
        </div>

        <p style="font-size: 13px; color: #5a7a8a; text-align: center; margin: 0 0 32px 0;">
          This code expires in <strong style="color: #1b3a4b;">5 minutes</strong>. If you didn't request this, please ignore this email.
        </p>

        <hr style="border: none; border-top: 1px solid #e2e8ec; margin: 24px 0;" />

        <p style="font-size: 11px; color: #a0b0b8; text-align: center; margin: 0;">
          &copy; ${new Date().getFullYear()} Manikan &mdash; Precision in every dimension.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("Resend email error:", error);
    throw new Error(error.message || "Failed to send verification email");
  }
}
