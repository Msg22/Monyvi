import { readFileSync } from "fs";
import path from "path";

const repoRoot = path.resolve(__dirname, "../../../..");
const VOICE_SERVER_ONLY_TABLES = [
  "voice_ai_usage_windows",
  "voice_ai_work_requests",
] as const;

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function readSyncExclusionBlock(): string {
  const source = readRepoFile("apps/mobile/services/sync/config.ts");
  const match = source.match(
    /export const EXCLUDED_TABLES = \[[\s\S]*?\] as const;/
  );
  if (match === null) {
    throw new Error("Could not find sync EXCLUDED_TABLES declaration");
  }
  return match[0];
}

describe("Voice AI server-only migration boundary", () => {
  it.each(VOICE_SERVER_ONLY_TABLES)(
    "%s is excluded from mobile sync",
    (tableName) => {
      expect(readSyncExclusionBlock()).toContain(`"${tableName}"`);
    }
  );

  it("keeps both voice operational tables out of Watermelon schema and migrations", () => {
    const localArtifacts = [
      readRepoFile("packages/db/src/schema.ts"),
      readRepoFile("packages/db/src/migrations.ts"),
    ];

    for (const artifact of localArtifacts) {
      for (const tableName of VOICE_SERVER_ONLY_TABLES) {
        expect(artifact).not.toContain(tableName);
      }
    }
  });
});
