import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  mergeQaCoverageManifest,
  type QaCoverageManifest,
  validateQaCoverageManifest,
} from "../qa-sms-candidate-importer";
import { buildTestCandidateId } from "./qa-sms-test-fixtures";
import type { QaCandidateArtifact } from "../qa-sms-pattern-types";

const candidateRoot = resolve(__dirname, "../../qa-sms-pattern-candidates/qnb");

function loadManifest(): QaCoverageManifest {
  return JSON.parse(
    readFileSync(
      resolve(
        __dirname,
        "../../qa-sms-pattern-candidates/coverage-manifest.json"
      ),
      "utf8"
    )
  ) as QaCoverageManifest;
}

function loadCandidates(): readonly QaCandidateArtifact[] {
  return readdirSync(candidateRoot)
    .filter((fileName) => fileName.endsWith(".json"))
    .flatMap((fileName) => {
      const parsed = JSON.parse(
        readFileSync(resolve(candidateRoot, fileName), "utf8")
      ) as { readonly candidates?: readonly QaCandidateArtifact[] };
      return parsed.candidates ?? [];
    });
}

describe("QA SMS coverage manifest", () => {
  it("contains every required family/currency combination exactly once", () => {
    const result = validateQaCoverageManifest(
      loadManifest(),
      loadCandidates(),
      false
    );
    expect(result.declarations).toHaveLength(16);
    expect(
      new Set(
        result.declarations.map(
          (row) => `${row.messageFamily}:${row.currency ?? "N/A"}`
        )
      ).size
    ).toBe(16);
  });

  it("accepts the completed source-controlled coverage manifest", () => {
    const result = validateQaCoverageManifest(
      loadManifest(),
      loadCandidates(),
      true
    );
    expect(result.declarations.some(({ status }) => status === "pending")).toBe(
      false
    );
  });

  it("merges declarations immutably and rejects unknown candidate references", () => {
    const sourceManifest = loadManifest();
    const candidates = loadCandidates();
    const manifest = {
      ...sourceManifest,
      declarations: sourceManifest.declarations.map((row) =>
        row.messageFamily === "bank_to_wallet_transfer"
          ? { ...row, status: "pending" as const, candidateIds: [] }
          : row
      ),
    };
    const updated = mergeQaCoverageManifest(
      manifest,
      [
        {
          providerId: "qnb-egypt",
          messageFamily: "bank_to_wallet_transfer",
          currency: "EGP",
          status: "unavailable_in_qa_dataset",
          candidateIds: [],
          recordedAt: "2026-07-13T03:00:00.000Z",
        },
      ],
      candidates
    );
    expect(updated).not.toBe(manifest);
    expect(
      updated.declarations.find(
        ({ messageFamily }) => messageFamily === "bank_to_wallet_transfer"
      )?.status
    ).toBe("unavailable_in_qa_dataset");
    expect(() =>
      validateQaCoverageManifest(
        {
          ...updated,
          declarations: updated.declarations.map((row) =>
            row.messageFamily === "card_purchase" && row.currency === "EGP"
              ? {
                  ...row,
                  status: "candidate_collected" as const,
                  candidateIds: [buildTestCandidateId("missing")],
                }
              : row
          ),
        },
        candidates,
        false
      )
    ).toThrow("unknown_coverage_candidate");
  });
});
