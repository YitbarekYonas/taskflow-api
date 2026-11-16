import { describe, expect, it } from "vitest";
import { oneLine, renderTaskAssigned } from "../../../src/mail/templates.js";

const base = {
  to: "alex@example.com",
  assigneeName: "Alex",
  assignerName: "Sam",
  task: { id: 7, title: "Write the report", priority: "high" as const, dueDate: "2026-12-01" },
  projectName: "TaskFlow API",
};

describe("renderTaskAssigned", () => {
  it("writes a plain-text message addressed to the assignee", () => {
    const mail = renderTaskAssigned(base);

    expect(mail.to).toBe("alex@example.com");
    expect(mail.subject).toBe("Sam assigned you: Write the report");
    expect(mail.text).toContain("Hi Alex,");
    expect(mail.text).toContain("Sam assigned you a task in TaskFlow API:");
    expect(mail.text).toContain("Priority: high");
    expect(mail.text).toContain("Due: 2026-12-01");
  });

  it("leaves out what a task does not have", () => {
    const mail = renderTaskAssigned({
      ...base,
      projectName: undefined,
      task: { ...base.task, dueDate: undefined },
    });

    expect(mail.text).not.toContain("Due:");
    expect(mail.text).toContain("Sam assigned you a task:");
  });

  it.each([
    ["the title", { task: { ...base.task, title: "Report\r\nBcc: evil@example.com" } }],
    ["the assigner's name", { assignerName: "Sam\nBcc: evil@example.com" }],
    ["the project name", { projectName: "Project\r\nBcc: evil@example.com" }],
  ])("flattens newlines in %s, so no header can be injected", (_name, overrides) => {
    const mail = renderTaskAssigned({ ...base, ...overrides });

    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.text).not.toMatch(/\r|\nBcc:/);
  });

  it("caps very long titles", () => {
    const mail = renderTaskAssigned({ ...base, task: { ...base.task, title: "x".repeat(1000) } });
    expect(mail.subject.length).toBeLessThanOrEqual(200);
  });

  it("never turns markup into anything: the body is plain text", () => {
    const mail = renderTaskAssigned({
      ...base,
      task: { ...base.task, title: "<script>alert(1)</script>" },
    });
    expect(mail.text).toContain("<script>alert(1)</script>"); // shown literally, in a text/plain message
  });
});

describe("oneLine", () => {
  it("collapses every kind of line break", () => {
    expect(oneLine("a\r\nb\nc\u2028d", 50)).toBe("a b c d");
  });
});
