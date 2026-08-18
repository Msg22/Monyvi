import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Budget Detail spacing ownership", () => {
  it("applies one screen gutter and one compact section gap", () => {
    const source = readFileSync(
      resolve(__dirname, "../../app/(private)/budget-detail.tsx"),
      "utf8"
    );

    expect(source).not.toContain('className="flex-1 px-5"');
    expect(source).not.toContain('<View className="mt-4">');
    expect(source).toContain('className="mx-5 mb-4');
  });
});
