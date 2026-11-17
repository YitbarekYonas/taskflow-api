import { mailer } from "../../src/container.js";
import { MemoryMailer } from "../../src/mail/mailer.js";

/** The in-memory mailbox used by the test configuration (MAIL_TRANSPORT=memory) */
export function outbox(): MemoryMailer {
  if (!(mailer instanceof MemoryMailer))
    throw new Error("tests must run with MAIL_TRANSPORT=memory");
  return mailer;
}
