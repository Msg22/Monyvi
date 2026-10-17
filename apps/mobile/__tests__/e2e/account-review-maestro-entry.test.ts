/**
 * #395 T008/T015/T054: static authored Maestro entry controls. These are
 * not native/device execution; their job is to reject invented scene links,
 * SMS-in-Voice routing, disabled entry assertions or a fake financial Save.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../e2e/maestro/account-review");
function yaml(name: string): string {
  return readFileSync(resolve(ROOT, name), "utf8");
}

describe("#395 E2E Voice entry static contract — tests first", () => {
  it("conditional states opens one real allowlisted synthetic Voice scene before its actual panel assertion", () => {
    const text = yaml("conditional-states.yaml");
    const open = text.indexOf(
      "monyvi://voice-review?reviewFixtureSceneId=r3-combined-en"
    );
    const panel = text.indexOf('id: "account-review-details-panel"');
    expect(open).toBeGreaterThan(0);
    expect(panel).toBeGreaterThan(open);
    expect(text).toContain('id: "account-review-filter-selected"');
    expect(text).toContain('id: "account-review-group-all-sheet"');
    expect(text).toContain('id: "account-review-edit-modal"');
    expect(text).not.toContain("reviewSession=");
    expect(text).not.toContain('id: "review-save-button"');
    expect(text).not.toMatch(
      /\b(?:inputText|runScript):.*(?:provider|password)/i
    );
  });

  it("chooser journey opens the real Voice scene and exercises an explicit chooser rather than a stale placeholder", () => {
    const text = yaml("choose-account-currency.yaml");
    expect(text).toContain(
      "monyvi://voice-review?reviewFixtureSceneId=r1-account-chooser"
    );
    expect(text).toContain('id: "account-review-account-choice-sheet"');
    expect(text).toContain('id: "account-review-account-use"');
    expect(text).not.toContain("monyvi://sms-review?reviewFixtureSceneId=");
    expect(text).not.toContain("reviewSession=");
    expect(text).not.toContain('id: "review-save-button"');
  });

  it("both authored journeys make their local-only role profile precondition explicit", () => {
    for (const name of [
      "conditional-states.yaml",
      "choose-account-currency.yaml",
    ]) {
      const text = yaml(name);
      expect(text).toContain("E2E_FIXTURE_PROFILE=account-review");
      expect(text).toContain("E2E_SUPABASE_MODE=local");
      expect(text).toContain("EXPO_PUBLIC_MONYVI_TEST_MODE=e2e");
    }
  });
});
