import type { FastifyBaseLogger } from "fastify";
import { createTransport } from "nodemailer";

import { env } from "./env";

const transport = env.SMTP_URL ? createTransport(env.SMTP_URL) : undefined;

/** An election's title as it appears in an email: on one line, and not too long. */
function quote(title: string): string {
  const line = title.replace(/\s+/g, " ").trim();
  return `"${line.length > 80 ? `${line.slice(0, 79)}…` : line}"`;
}

/** Emails a registration code. Without SMTP_URL, allowed only on Anvil, it logs the code. */
export async function sendCode(
  message: { to: string; code: string; electionTitle: string; validMinutes: number },
  log: FastifyBaseLogger,
): Promise<void> {
  if (!transport) {
    log.info({ to: message.to, code: message.code }, "SMTP_URL is not set; logging the code");
    return;
  }
  await transport.sendMail({
    from: env.MAIL_FROM,
    to: message.to,
    subject: `${message.code} is your DVote code`,
    text:
      `Your code to register for ${quote(message.electionTitle)} is ${message.code}. ` +
      `It works for ${message.validMinutes} minutes.\n\n` +
      "If you did not ask for this code, you can ignore this email.",
  });
}
