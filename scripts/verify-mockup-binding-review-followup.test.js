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

function writeApprovedFixture(
  root,
  bindingFacts = completeBindingFacts(),
  bindingRevisionBytes = Buffer.from(bindingFacts, "utf8")
) {
  const imageBytes = Buffer.from("approved-image");
  const imageRevision = sha256(imageBytes);
  const bindingRevision = sha256(bindingRevisionBytes);
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

test("does not treat setext-looking text inside a fenced code block as the next Binding Facts boundary", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monyvi-mockup-binding-"));
  const approvedPrefix = `${completeBindingFacts()}\`\`\`text\n`;
  const bindingFacts = `${approvedPrefix}History\n---\n\`\`\`\n- Review note: changed after approval\n`;
  const sidecarPath = writeApprovedFixture(
    root,
    bindingFacts,
    Buffer.from(approvedPrefix, "utf8")
  );

  const result = verifyMockupBinding(sidecarPath);

  assert.equal(result.isAuthoritative, false);
  assert.match(
    result.errors.join("\n"),
    /binding metadata revision does not match current binding facts/i
  );
});

test("counts Markdown-equivalent unordered list bullets as duplicate canonical facts", () => {
  for (const duplicate of [
    "* State facts: conflicting",
    "+ State facts: conflicting",
    "  * State facts: conflicting",
  ]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "monyvi-mockup-binding-"));
    const bindingFacts = `${completeBindingFacts()}${duplicate}\n`;
    const sidecarPath = writeApprovedFixture(
      root,
      bindingFacts,
      Buffer.from(`${bindingFacts}\n`, "utf8")
    );

    const result = verifyMockupBinding(sidecarPath);

    assert.equal(
      result.isAuthoritative,
      false,
      `expected duplicate fact rejection for ${JSON.stringify(duplicate)}`
    );
    assert.match(
      result.errors.join("\n"),
      /required Binding Facts key must occur exactly once: State facts/i
    );
  }
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
  assert.match(workflow, /responsive, theme, RTL\/Arabic, and\s+enlarged-text variant/i);
});

test("source-command review uses an independent trust path when the verifier is in the diff", () => {
  const skill = fs.readFileSync(
    path.resolve(__dirname, "..", ".agents/skills/source-command-code-review/SKILL.md"),
    "utf8"
  );

  assert.match(skill, /If `scripts\/verify-mockup-binding\.js` is in the target diff/i);
  assert.match(skill, /trusted\s+base revision/i);
  assert.match(skill, /independently\s+recompute[\s\S]{0,220}image[\s\S]{0,220}Binding Facts/i);
});

test("source-command independent fallback validates the complete sidecar authority contract", () => {
  const skill = fs.readFileSync(
    path.resolve(__dirname, "..", ".agents/skills/source-command-code-review/SKILL.md"),
    "utf8"
  );
  const start = skill.indexOf("If `scripts/verify-mockup-binding.js` is in the target diff");
  const end = skill.indexOf("\n\nIf an approved reference predates", start);

  assert.ok(start >= 0 && end > start, "expected independent-verifier fallback section");
  const fallback = skill.slice(start, end);

  assert.match(fallback, /complete sidecar authority contract/i);
  assert.match(fallback, /valid UTF-8\/LF/i);
  assert.match(fallback, /exactly one .*Binding Facts heading/i);
  assert.match(
    fallback,
    /required Binding Facts keys?[\s\S]*exactly once[\s\S]*non-empty/i
  );
  assert.match(fallback, /Binding metadata approval: `?APPROVED`?/i);
  assert.match(
    fallback,
    /Approved binding metadata revision[\s\S]*Binding metadata revision/i
  );
  assert.match(
    fallback,
    /Approved binding approval revision[\s\S]*Binding approval revision/i
  );
  assert.match(
    fallback,
    /approval evidence[\s\S]*Approved binding approval revision/i
  );
});
