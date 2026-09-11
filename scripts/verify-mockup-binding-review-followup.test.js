const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { verifyMockupBinding } = require("./verify-mockup-binding");

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function approvalRevision(imageRevision, bindingRevision) {
  return sha256(
    Buffer.from(
      `approved-reference-image-revision=${imageRevision}\n` +
        `binding-metadata-revision=${bindingRevision}\n`,
      "utf8"
    )
  );
}

function completeBindingFacts() {
  return [
    "- Binding product surface: `/metals` portfolio screen",
    "- Declared comparison context: 853x1844 product UI viewport",
    "- Presentation-only framing: none",
    "- Spacing facts: UNKNOWN",
    "- Sizing facts: UNKNOWN",
    "- Color/theme facts: UNKNOWN",
    "- Typography facts: UNKNOWN",
    "- State facts: UNKNOWN",
    "- Interaction behavior: UNKNOWN",
    "- Transition behavior: UNKNOWN",
    "- Responsive variants: UNKNOWN",
    "- Dark-mode variants: UNKNOWN",
    "- RTL/Arabic variants: UNKNOWN",
    "- Enlarged-text variants: UNKNOWN",
    "- Fidelity-affecting unknowns: UNKNOWN",
    "",
  ].join("\n");
}

function writeApprovedFixture(root, bindingFacts = completeBindingFacts()) {
  const imageBytes = Buffer.from("approved-image");
  const imageRevision = sha256(imageBytes);
  const bindingRevision = sha256(Buffer.from(bindingFacts, "utf8"));
  const authorityRevision = approvalRevision(imageRevision, bindingRevision);
  const imagePath = path.join(root, "approved.png");
  const sidecarPath = path.join(root, "approved.binding.md");

  fs.writeFileSync(imagePath, imageBytes);
  fs.writeFileSync(
    sidecarPath,
    [
      "# Mockup binding",
      "",
      "- Approved reference image: approved.png",
      `- Approved reference image revision: ${imageRevision}`,
      "- Binding metadata approval: APPROVED",
      `- Binding metadata revision: ${bindingRevision}`,
      `- Approved binding metadata revision: ${bindingRevision}`,
      `- Binding approval revision: ${authorityRevision}`,
      `- Approved binding approval revision: ${authorityRevision}`,
      `- Binding metadata approval evidence/reference: issue-fixture ${authorityRevision}`,
      "",
      "## Binding Facts",
      bindingFacts,
      "## History",
      "",
    ].join("\n"),
    "utf8"
  );

  return sidecarPath;
}

test("rejects a duplicate setext Binding Facts heading outside the approved fingerprint", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monyvi-mockup-binding-"));
  const sidecarPath = writeApprovedFixture(root);
  fs.appendFileSync(
    sidecarPath,
    "\nBinding Facts\n---\n- Binding product surface: injected\n",
    "utf8"
  );

  const result = verifyMockupBinding(sidecarPath);

  assert.equal(result.isAuthoritative, false);
  assert.match(result.errors.join("\n"), /exactly one .*Binding Facts heading/i);
});

test("does not count a canonical fact hidden inside an HTML comment", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monyvi-mockup-binding-"));
  const commentedFacts = completeBindingFacts().replace(
    "- State facts: UNKNOWN",
    "<!--\n- State facts: UNKNOWN\n-->"
  );
  const sidecarPath = writeApprovedFixture(root, commentedFacts);

  const result = verifyMockupBinding(sidecarPath);

  assert.equal(result.isAuthoritative, false);
  assert.match(result.errors.join("\n"), /required Binding Facts key.*State facts/i);
});

test("Claude task generation blocks fidelity-affecting UNKNOWN values", () => {
  const workflow = fs.readFileSync(
    path.resolve(__dirname, "..", ".claude/commands/speckit.tasks.md"),
    "utf8"
  );

  assert.match(workflow, /fidelity-affecting `UNKNOWN`[\s\S]{0,120}pre-implementation blocker/i);
});

test("Claude task generation emits mandatory mockup visual and accessibility evidence tasks", () => {
  const workflow = fs.readFileSync(
    path.resolve(__dirname, "..", ".claude/commands/speckit.tasks.md"),
    "utf8"
  );

  assert.match(workflow, /required rendered visual-evidence tasks/i);
  assert.match(workflow, /separate accessibility-evidence tasks/i);
  assert.match(workflow, /baseline side-by-side or overlay comparison/i);
  assert.match(workflow, /responsive, dark-mode, RTL\/Arabic, and enlarged-text variant/i);
});

test("source-command review uses an independent trust path when the verifier is in the diff", () => {
  const skill = fs.readFileSync(
    path.resolve(__dirname, "..", ".agents/skills/source-command-code-review/SKILL.md"),
    "utf8"
  );

  assert.match(skill, /If `scripts\/verify-mockup-binding\.js` is in the target diff/i);
  assert.match(skill, /trusted base revision/i);
  assert.match(skill, /independently recompute[\s\S]{0,220}image[\s\S]{0,220}Binding Facts/i);
});
