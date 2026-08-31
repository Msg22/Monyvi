import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("financial action public surface", () => {
  it("defers the root barrel export until the integration task", () => {
    const source = readFileSync(resolve(__dirname, "../../index.ts"), "utf8");

    expect(source).not.toContain('export * from "./financial-actions";');
  });
});
