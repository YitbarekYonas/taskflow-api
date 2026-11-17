import { describe, expect, it } from "vitest";
import { SmtpMailer } from "../../src/mail/mailer.js";

const MAILPIT = process.env.TEST_MAILPIT_URL ?? "http://localhost:8025";
const SMTP_URL = process.env.TEST_SMTP_URL ?? "smtp://localhost:1025";
const FROM = "TaskFlow <noreply@taskflow.local>";

type Stored = {
  Subject: string;
  From: { Address: string };
  To: Array<{ Address: string }>;
  Cc: unknown[];
  Bcc: unknown[];
};

async function findBySubject(fragment: string): Promise<Stored | undefined> {
  const response = await fetch(`${MAILPIT}/api/v1/messages`);
  const body = (await response.json()) as { messages: Stored[] };
  return body.messages.find((m) => m.Subject.includes(fragment));
}

describe("SmtpMailer against Mailpit", () => {
  it("delivers a message through real SMTP", async () => {
    const reachable = await fetch(`${MAILPIT}/api/v1/info`).then(
      (r) => r.ok,
      () => false,
    );
    if (!reachable) throw new Error("Cannot reach Mailpit. Is it running? Try: npm run db:up");
    const subject = `smtp-test-${Date.now()}`;
    const mailer = new SmtpMailer(SMTP_URL, FROM);

    try {
      await mailer.send({ to: "someone@example.com", subject, text: "hello" });
    } finally {
      mailer.close();
    }

    const stored = await findBySubject(subject);
    expect(stored).toBeDefined();
    expect(stored!.To.map((t) => t.Address)).toEqual(["someone@example.com"]);
    expect(stored!.From.Address).toBe("noreply@taskflow.local");
  });

  it("does not let a newline in the subject add a recipient", async () => {
    const marker = `inject-${Date.now()}`;
    const mailer = new SmtpMailer(SMTP_URL, FROM);

    try {
      await mailer.send({
        to: "someone@example.com",
        subject: `${marker}\r\nBcc: attacker@example.com`,
        text: "x",
      });
    } finally {
      mailer.close();
    }

    const stored = await findBySubject(marker);
    expect(stored).toBeDefined();
    expect(JSON.stringify([stored!.To, stored!.Cc, stored!.Bcc])).not.toContain("attacker");
  });

  it("rejects, so a job would be retried, when nothing is listening", async () => {
    const mailer = new SmtpMailer("smtp://127.0.0.1:2599", FROM);
    try {
      await expect(
        mailer.send({ to: "someone@example.com", subject: "x", text: "x" }),
      ).rejects.toThrow();
    } finally {
      mailer.close();
    }
  });
});
