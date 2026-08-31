import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("stable package integration public surface", () => {
  it("exports Metals and generic financial actions exactly once", () => {
    const source = readFileSync(resolve(__dirname, "../../index.ts"), "utf8");

    expect(source.match(/^export \* from "\.\/metals";$/gm) ?? []).toHaveLength(1);
    expect(
      source.match(/^export \* from "\.\/financial-actions";$/gm) ?? []
    ).toHaveLength(1);
  });
});
