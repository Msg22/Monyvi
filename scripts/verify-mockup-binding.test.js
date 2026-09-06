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

function writeApprovedFixture(
  root,
  imageBytes = Buffer.from("approved-image")
) {
  const imagePath = path.join(root, "approved.png");
  const sidecarPath = path.join(root, "approved.binding.md");
  const bindingFacts = [
    "- Binding product surface: `/metals` portfolio screen",
    "- Declared comparison context: 853x1844 product UI viewport",
    "- Presentation-only framing: none",
    "",
  ].join("\n");
  const bindingRevision = sha256(Buffer.from(bindingFacts, "utf8"));
  const imageRevision = sha256(imageBytes);
  const authorityRevision = approvalRevision(imageRevision, bindingRevision);

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
    ].join("\n"),
    "utf8"
  );

  return {
    imagePath,
    sidecarPath,
    imageRevision,
    bindingRevision,
    authorityRevision,
  };
}

test("accepts an approved sidecar only when the image, metadata, and approval revision all match", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monyvi-mockup-binding-"));
  const { sidecarPath, imageRevision, authorityRevision } =
    writeApprovedFixture(root);

  const result = verifyMockupBinding(sidecarPath);

  assert.equal(result.isAuthoritative, true);
  assert.equal(result.currentImageRevision, imageRevision);
  assert.equal(result.currentBindingApprovalRevision, authorityRevision);
  assert.deepEqual(result.errors, []);
});

test("invalidates approval when image content changes under the same filename", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monyvi-mockup-binding-"));
  const { imagePath, sidecarPath } = writeApprovedFixture(root);
  fs.writeFileSync(imagePath, Buffer.from("regenerated-unapproved-image"));

  const result = verifyMockupBinding(sidecarPath);

  assert.equal(result.isAuthoritative, false);
  assert.match(
    result.errors.join("\n"),
    /approved reference image revision does not match current image content/i
  );
});

test("does not transfer approval when image bytes and their digest are changed together", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monyvi-mockup-binding-"));
  const { imagePath, sidecarPath, imageRevision } = writeApprovedFixture(root);
  const replacementBytes = Buffer.from("replacement-image-with-new-digest");
  const replacementRevision = sha256(replacementBytes);
  fs.writeFileSync(imagePath, replacementBytes);
  const sidecar = fs
    .readFileSync(sidecarPath, "utf8")
    .replace(imageRevision, replacementRevision);
  fs.writeFileSync(sidecarPath, sidecar, "utf8");

  const result = verifyMockupBinding(sidecarPath);

  assert.equal(result.isAuthoritative, false);
  assert.match(
    result.errors.join("\n"),
    /binding approval revision does not match the current image and binding metadata/i
  );
});

test("rejects an approved sidecar that omits the immutable image revision", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monyvi-mockup-binding-"));
  const { sidecarPath } = writeApprovedFixture(root);
  const sidecar = fs
    .readFileSync(sidecarPath, "utf8")
    .replace(/^- Approved reference image revision:.*\n/m, "");
  fs.writeFileSync(sidecarPath, sidecar, "utf8");

  const result = verifyMockupBinding(sidecarPath);

  assert.equal(result.isAuthoritative, false);
  assert.match(
    result.errors.join("\n"),
    /approved reference image revision is required/i
  );
});

test("rejects stale binding-facts fingerprints independently of image identity", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monyvi-mockup-binding-"));
  const { sidecarPath } = writeApprovedFixture(root);
  const sidecar = fs
    .readFileSync(sidecarPath, "utf8")
    .replace("portfolio screen", "portfolio screen changed after approval");
  fs.writeFileSync(sidecarPath, sidecar, "utf8");

  const result = verifyMockupBinding(sidecarPath);

  assert.equal(result.isAuthoritative, false);
  assert.match(
    result.errors.join("\n"),
    /binding metadata revision does not match current binding facts/i
  );
});

test("rejects byte-only binding-facts changes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monyvi-mockup-binding-"));
  const { sidecarPath } = writeApprovedFixture(root);
  const sidecar = fs
    .readFileSync(sidecarPath, "utf8")
    .replace("portfolio screen\n", "portfolio screen  \n");
  fs.writeFileSync(sidecarPath, sidecar, "utf8");

  const result = verifyMockupBinding(sidecarPath);

  assert.equal(result.isAuthoritative, false);
  assert.match(
    result.errors.join("\n"),
    /binding metadata revision does not match current binding facts/i
  );
});

test("rejects a sidecar whose approval status is pending", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monyvi-mockup-binding-"));
  const { sidecarPath } = writeApprovedFixture(root);
  const sidecar = fs
    .readFileSync(sidecarPath, "utf8")
    .replace(
      "Binding metadata approval: APPROVED",
      "Binding metadata approval: PENDING"
    );
  fs.writeFileSync(sidecarPath, sidecar, "utf8");

  const result = verifyMockupBinding(sidecarPath);

  assert.equal(result.isAuthoritative, false);
  assert.match(
    result.errors.join("\n"),
    /binding metadata approval must be APPROVED/i
  );
});

test("rejects a sidecar whose approved metadata revision is stale", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monyvi-mockup-binding-"));
  const { sidecarPath, bindingRevision } = writeApprovedFixture(root);
  const staleRevision = `sha256:${"0".repeat(64)}`;
  const sidecar = fs
    .readFileSync(sidecarPath, "utf8")
    .replace(
      `Approved binding metadata revision: ${bindingRevision}`,
      `Approved binding metadata revision: ${staleRevision}`
    );
  fs.writeFileSync(sidecarPath, sidecar, "utf8");

  const result = verifyMockupBinding(sidecarPath);

  assert.equal(result.isAuthoritative, false);
  assert.match(
    result.errors.join("\n"),
    /approved binding metadata revision must equal binding metadata revision/i
  );
});

test("rejects approval evidence that does not identify the approved binding revision", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monyvi-mockup-binding-"));
  const { sidecarPath, authorityRevision } = writeApprovedFixture(root);
  const staleAuthorityRevision = `sha256:${"f".repeat(64)}`;
  const sidecar = fs
    .readFileSync(sidecarPath, "utf8")
    .replace(
      `Binding metadata approval evidence/reference: issue-fixture ${authorityRevision}`,
      `Binding metadata approval evidence/reference: issue-fixture ${staleAuthorityRevision}`
    );
  fs.writeFileSync(sidecarPath, sidecar, "utf8");

  const result = verifyMockupBinding(sidecarPath);

  assert.equal(result.isAuthoritative, false);
  assert.match(
    result.errors.join("\n"),
    /approval evidence\/reference must identify the approved binding approval revision/i
  );
});

test("rejects a sidecar whose approved combined revision is stale", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monyvi-mockup-binding-"));
  const { sidecarPath, authorityRevision } = writeApprovedFixture(root);
  const staleAuthorityRevision = `sha256:${"a".repeat(64)}`;
  const sidecar = fs
    .readFileSync(sidecarPath, "utf8")
    .replace(
      `Approved binding approval revision: ${authorityRevision}`,
      `Approved binding approval revision: ${staleAuthorityRevision}`
    );
  fs.writeFileSync(sidecarPath, sidecar, "utf8");

  const result = verifyMockupBinding(sidecarPath);

  assert.equal(result.isAuthoritative, false);
  assert.match(
    result.errors.join("\n"),
    /approved binding approval revision must equal binding approval revision/i
  );
});

test("rejects malformed UTF-8 instead of hashing decoded replacement text", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monyvi-mockup-binding-"));
  const { sidecarPath } = writeApprovedFixture(root);
  const sidecarBytes = fs.readFileSync(sidecarPath);
  fs.writeFileSync(
    sidecarPath,
    Buffer.concat([sidecarBytes, Buffer.from([0xc3, 0x28])])
  );

  const result = verifyMockupBinding(sidecarPath);

  assert.equal(result.isAuthoritative, false);
  assert.match(
    result.errors.join("\n"),
    /binding sidecar must be valid UTF-8/i
  );
});

test("requires every mandatory mockup workflow to invoke the binding verifier", () => {
  const repositoryRoot = path.resolve(__dirname, "..");
  const mandatoryConsumers = [
    ".agent/workflows/sprint-issue.md",
    ".agent/workflows/speckit.implement.md",
    ".agent/workflows/code-review.md",
    ".agent/workflows/style-audit.md",
    ".claude/commands/speckit.implement.md",
    ".claude/commands/code-review.md",
    ".claude/commands/style-audit.md",
    ".agent/workflows/applying-mockups.md",
    ".agent/workflows/mockup-implementation.md",
    ".claude/commands/applying-mockups.md",
    ".claude/commands/mockup-implementation.md",
    ".agents/skills/source-command-code-review/SKILL.md",
  ];

  for (const consumerPath of mandatoryConsumers) {
    const consumer = fs.readFileSync(
      path.join(repositoryRoot, consumerPath),
      "utf8"
    );
    assert.match(
      consumer,
      /node scripts\/verify-mockup-binding\.js <[^>]+>/,
      `${consumerPath} must invoke the mockup binding verifier`
    );
  }
});

test("requires approval workflows to record and evidence the combined approval revision", () => {
  const workflowPath = path.resolve(
    __dirname,
    "..",
    ".agent/workflows/mockup-implementation.md"
  );
  const workflow = fs.readFileSync(workflowPath, "utf8");

  assert.match(workflow, /Binding approval revision/);
  assert.match(workflow, /Approved binding approval revision/);
  assert.match(
    workflow,
    /approval evidence\/reference[\s\S]*approved combined/i
  );
});
