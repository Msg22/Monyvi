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

function writeApprovedFixture(root, imageBytes = Buffer.from("approved-image")) {
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
      "- Binding metadata approval evidence/reference: issue-fixture",
      "",
      "## Binding Facts",
      bindingFacts,
    ].join("\n"),
    "utf8"
  );

  return { imagePath, sidecarPath, imageRevision, bindingRevision };
}

test("accepts an approved sidecar only when the current image bytes match the approved revision", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monyvi-mockup-binding-"));
  const { sidecarPath, imageRevision } = writeApprovedFixture(root);

  const result = verifyMockupBinding(sidecarPath);

  assert.equal(result.isAuthoritative, true);
  assert.equal(result.currentImageRevision, imageRevision);
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

test("rejects an approved sidecar that omits the immutable image revision", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monyvi-mockup-binding-"));
  const { sidecarPath } = writeApprovedFixture(root);
  const sidecar = fs
    .readFileSync(sidecarPath, "utf8")
    .replace(/^- Approved reference image revision:.*\n/m, "");
  fs.writeFileSync(sidecarPath, sidecar, "utf8");

  const result = verifyMockupBinding(sidecarPath);

  assert.equal(result.isAuthoritative, false);
  assert.match(result.errors.join("\n"), /approved reference image revision is required/i);
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
  assert.match(result.errors.join("\n"), /binding metadata revision does not match current binding facts/i);
});
