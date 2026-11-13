import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { envSchema } from "../../src/config.js";

const read = (file: string) => readFileSync(file, "utf-8");
const readme = read("README.md");
const envExample = read(".env.example");
const changelog = read("CHANGELOG.md");
const pkg = JSON.parse(read("package.json")) as {
  version: string;
  scripts: Record<string, string>;
};

describe("configuration documentation", () => {
  const variables = Object.keys(envSchema.shape);

  it.each(variables)("%s appears in .env.example", (name) => {
    expect(envExample).toMatch(new RegExp(`^#?\\s*${name}=`, "m"));
  });

  it.each(variables)("%s is described in the README", (name) => {
    expect(readme).toContain(`\`${name}\``);
  });

  it("has nothing in .env.example that the configuration does not know", () => {
    const declared = [...envExample.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]);
    expect(declared.filter((name) => !variables.includes(name))).toEqual([]);
  });
});

describe("README commands", () => {
  const mentioned = [
    ...new Set([...readme.matchAll(/npm run ([\w:-]+)/g)].map((match) => match[1])),
  ];

  it("mentions at least a few commands, so the check below is not vacuous", () => {
    expect(mentioned.length).toBeGreaterThan(5);
  });

  it.each(mentioned)("`npm run %s` exists in package.json", (name) => {
    expect(Object.keys(pkg.scripts)).toContain(name);
  });
});

describe("release hygiene", () => {
  it("has a changelog section for the current version", () => {
    expect(changelog).toContain(`## ${pkg.version}`);
  });
});
