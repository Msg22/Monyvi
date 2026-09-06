const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const PENDING = "PENDING";

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function readField(markdown, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`^- ${escaped}:\\s*(.+?)\\s*$`, "m"));
  return match ? match[1] : null;
}

function extractBindingFacts(markdown) {
  if (markdown.includes("\r")) {
    throw new Error("binding sidecar must use UTF-8/LF line endings");
  }

  const heading = "## Binding Facts\n";
  const start = markdown.indexOf(heading);
  if (start === -1) {
    throw new Error("## Binding Facts heading is required");
  }

  const factsStart = start + heading.length;
  const nextHeading = markdown.indexOf("\n## ", factsStart);
  return markdown.slice(factsStart, nextHeading === -1 ? markdown.length : nextHeading + 1);
}

function verifyMockupBinding(sidecarPath) {
  const errors = [];
  let markdown;

  try {
    markdown = fs.readFileSync(sidecarPath, "utf8");
  } catch (error) {
    return {
      isAuthoritative: false,
      errors: [`unable to read binding sidecar: ${error.message}`],
      currentImageRevision: null,
      currentBindingMetadataRevision: null,
    };
  }

  const imageName = readField(markdown, "Approved reference image");
  const approvedImageRevision = readField(
    markdown,
    "Approved reference image revision"
  );
  const approvalStatus = readField(markdown, "Binding metadata approval");
  const declaredBindingRevision = readField(markdown, "Binding metadata revision");
  const approvedBindingRevision = readField(
    markdown,
    "Approved binding metadata revision"
  );
  const approvalEvidence = readField(
    markdown,
    "Binding metadata approval evidence/reference"
  );

  if (!imageName) {
    errors.push("approved reference image is required");
  }

  if (!approvedImageRevision || !SHA256_PATTERN.test(approvedImageRevision)) {
    errors.push("approved reference image revision is required as sha256:<64 lowercase hex>");
  }

  let currentImageRevision = null;
  if (imageName) {
    const imagePath = path.resolve(path.dirname(sidecarPath), imageName);
    try {
      currentImageRevision = sha256(fs.readFileSync(imagePath));
      if (
        approvedImageRevision &&
        SHA256_PATTERN.test(approvedImageRevision) &&
        currentImageRevision !== approvedImageRevision
      ) {
        errors.push(
          "approved reference image revision does not match current image content"
        );
      }
    } catch (error) {
      errors.push(`unable to read approved reference image: ${error.message}`);
    }
  }

  let currentBindingMetadataRevision = null;
  try {
    currentBindingMetadataRevision = sha256(
      Buffer.from(extractBindingFacts(markdown), "utf8")
    );
    if (
      !declaredBindingRevision ||
      !SHA256_PATTERN.test(declaredBindingRevision)
    ) {
      errors.push("binding metadata revision is required as sha256:<64 lowercase hex>");
    } else if (declaredBindingRevision !== currentBindingMetadataRevision) {
      errors.push("binding metadata revision does not match current binding facts");
    }
  } catch (error) {
    errors.push(error.message);
  }

  if (approvalStatus !== "APPROVED") {
    errors.push("binding metadata approval must be APPROVED");
  }

  if (
    !approvedBindingRevision ||
    approvedBindingRevision === PENDING ||
    approvedBindingRevision !== declaredBindingRevision
  ) {
    errors.push(
      "approved binding metadata revision must equal binding metadata revision"
    );
  }

  if (!approvalEvidence || approvalEvidence === PENDING) {
    errors.push("binding metadata approval evidence/reference is required");
  }

  return {
    isAuthoritative: errors.length === 0,
    errors,
    currentImageRevision,
    currentBindingMetadataRevision,
  };
}

function runCli(sidecarPaths) {
  if (sidecarPaths.length === 0) {
    console.error("Usage: node scripts/verify-mockup-binding.js <sidecar.binding.md> [...]");
    return 2;
  }

  let hasFailure = false;
  for (const sidecarPath of sidecarPaths) {
    const result = verifyMockupBinding(sidecarPath);
    if (result.isAuthoritative) {
      console.log(`PASS ${sidecarPath}`);
      continue;
    }

    hasFailure = true;
    console.error(`FAIL ${sidecarPath}`);
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
  }

  return hasFailure ? 1 : 0;
}

if (require.main === module) {
  process.exitCode = runCli(process.argv.slice(2));
}

module.exports = {
  verifyMockupBinding,
};
