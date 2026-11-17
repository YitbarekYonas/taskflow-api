import nodemailer from "nodemailer";
import { logger } from "../logger.js";

export type MailMessage = { to: string; subject: string; text: string };

export interface Mailer {
  send(message: MailMessage): Promise<void>;
  /** Releases any connection held by the transport. Called on shutdown. */
  close?(): void;
}

/** Real delivery over SMTP (Mailpit in development). Rejects when delivery fails, so a job retries. */
export class SmtpMailer implements Mailer {
  private readonly transport;

  constructor(
    url: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport({
      url,
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text, // plain text only: nothing a user typed can become markup
    });
  }

  close(): void {
    this.transport.close();
  }
}

/** Keeps messages in memory. Used by the tests. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  /** Test hook: return an error to make the next sends fail */
  failWith: ((message: MailMessage) => Error | undefined) | undefined;

  async send(message: MailMessage): Promise<void> {
    const error = this.failWith?.(message);
    if (error) throw error;
    this.sent.push({ ...message });
  }

  clear(): void {
    this.sent.length = 0;
    this.failWith = undefined;
  }
}

/** Development without Mailpit: records THAT a mail would be sent, never to whom or what. */
export class LogMailer implements Mailer {
  async send(): Promise<void> {
    logger.info({ event: "mail.logged" }, "mail not sent (MAIL_TRANSPORT=log)");
  }
}

export function createMailer(options: {
  transport: "smtp" | "memory" | "log";
  smtpUrl?: string;
  from: string;
}): Mailer {
  switch (options.transport) {
    case "smtp":
      return new SmtpMailer(options.smtpUrl ?? "", options.from);
    case "memory":
      return new MemoryMailer();
    case "log":
      return new LogMailer();
  }
}
