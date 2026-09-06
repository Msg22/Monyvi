const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const PENDING = "PENDING";
const BINDING_FACTS_HEADING = Buffer.from("## Binding Facts\n", "utf8");
const REQUIRED_BINDING_FACTS = [
  "Binding product surface",
  "Declared comparison context",
  "Presentation-only framing",
  "Spacing facts",
  "Sizing facts",
  "Color/theme facts",
  "Typography facts",
  "State facts",
  "Interaction behavior",
  "Transition behavior",
  "Responsive variants",
  "Dark-mode variants",
  "RTL/Arabic variants",
  "Enlarged-text variants",
  "Fidelity-affecting unknowns",
];

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function buildBindingApprovalRevision(imageRevision, bindingRevision) {
  return sha256(
    Buffer.from(
      `approved-reference-image-revision=${imageRevision}\n` +
        `binding-metadata-revision=${bindingRevision}\n`,
      "utf8"
    )
  );
}

function readField(markdown, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`^- ${escaped}:\\s*(.+?)\\s*$`, "m"));
  return match ? match[1] : null;
}

function countOccurrences(buffer, needle) {
  let count = 0;
  let offset = 0;
  while (offset <= buffer.length - needle.length) {
    const found = buffer.indexOf(needle, offset);
    if (found === -1) break;
    count += 1;
    offset = found + needle.length;
  }
  return count;
}

function extractBindingFactsBytes(sidecarBytes) {
  if (sidecarBytes.includes(0x0d)) {
    throw new Error("binding sidecar must use UTF-8/LF line endings");
  }

  const headingCount = countOccurrences(sidecarBytes, BINDING_FACTS_HEADING);
  if (headingCount !== 1) {
    throw new Error("binding sidecar must contain exactly one ## Binding Facts heading");
  }

  const start = sidecarBytes.indexOf(BINDING_FACTS_HEADING);
  const factsStart = start + BINDING_FACTS_HEADING.length;
  const nextHeading = sidecarBytes.indexOf(Buffer.from("\n## ", "utf8"), factsStart);
  return sidecarBytes.subarray(
    factsStart,
    nextHeading === -1 ? sidecarBytes.length : nextHeading + 1
  );
}

function validateBindingFacts(bindingFactsMarkdown) {
  const errors = [];
  for (const label of REQUIRED_BINDING_FACTS) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = [
      ...bindingFactsMarkdown.matchAll(
        new RegExp(`^- ${escaped}:\\s*(.*?)\\s*$`, "gm")
      ),
    ];

    if (matches.length !== 1) {
      errors.push(`required Binding Facts key must occur exactly once: ${label}`);
      continue;
    }

    if (!matches[0][1].trim()) {
      errors.push(`required Binding Facts key must have a non-empty value: ${label}`);
    }
  }
  return errors;
}

function verifyMockupBinding(sidecarPath) {
  const errors = [];
  let sidecarBytes;
  let markdown;

  try {
    sidecarBytes = fs.readFileSync(sidecarPath);
  } catch (error) {
    return {
      isAuthoritative: false,
      errors: [`unable to read binding sidecar: ${error.message}`],
      currentImageRevision: null,
      currentBindingMetadataRevision: null,
      currentBindingApprovalRevision: null,
    };
  }

  try {
    markdown = new TextDecoder("utf-8", { fatal: true }).decode(sidecarBytes);
  } catch {
    return {
      isAuthoritative: false,
      errors: ["binding sidecar must be valid UTF-8"],
      currentImageRevision: null,
      currentBindingMetadataRevision: null,
      currentBindingApprovalRevision: null,
    };
  }

  const imageName = readField(markdown, "Approved reference image");
  const approvedImageRevision = readField(markdown, "Approved reference image revision");
  const approvalStatus = readField(markdown, "Binding metadata approval");
  const declaredBindingRevision = readField(markdown, "Binding metadata revision");
  const approvedBindingRevision = readField(markdown, "Approved binding metadata revision");
  const declaredBindingApprovalRevision = readField(markdown, "Binding approval revision");
  const approvedBindingApprovalRevision = readField(markdown, "Approved binding approval revision");
  const approvalEvidence = readField(markdown, "Binding metadata approval evidence/reference");

  if (!imageName) {
    errors.push("approved reference image is required");
  }

  const hasValidImageRevision =
    approvedImageRevision !== null && SHA256_PATTERN.test(approvedImageRevision);
  if (!hasValidImageRevision) {
    errors.push("approved reference image revision is required as sha256:<64 lowercase hex>");
  }

  let currentImageRevision = null;
  if (imageName) {
    const imagePath = path.resolve(path.dirname(sidecarPath), imageName);
    try {
      currentImageRevision = sha256(fs.readFileSync(imagePath));
      if (hasValidImageRevision && currentImageRevision !== approvedImageRevision) {
        errors.push("approved reference image revision does not match current image content");
      }
    } catch (error) {
      errors.push(`unable to read approved reference image: ${error.message}`);
    }
  }

  let currentBindingMetadataRevision = null;
  const hasValidDeclaredBindingRevision =
    declaredBindingRevision !== null && SHA256_PATTERN.test(declaredBindingRevision);
  try {
    const bindingFactsBytes = extractBindingFactsBytes(sidecarBytes);
    const bindingFactsMarkdown = new TextDecoder("utf-8", { fatal: true }).decode(bindingFactsBytes);
    errors.push(...validateBindingFacts(bindingFactsMarkdown));
    currentBindingMetadataRevision = sha256(bindingFactsBytes);
    if (!hasValidDeclaredBindingRevision) {
      errors.push("binding metadata revision is required as sha256:<64 lowercase hex>");
    } else if (declaredBindingRevision !== currentBindingMetadataRevision) {
      errors.push("binding metadata revision does not match current binding facts");
    }
  } catch (error) {
    errors.push(error.message);
  }

  let currentBindingApprovalRevision = null;
  if (hasValidImageRevision && hasValidDeclaredBindingRevision) {
    currentBindingApprovalRevision = buildBindingApprovalRevision(
      approvedImageRevision,
      declaredBindingRevision
    );
  }

  if (!declaredBindingApprovalRevision || !SHA256_PATTERN.test(declaredBindingApprovalRevision)) {
    errors.push("binding approval revision is required as sha256:<64 lowercase hex>");
  } else if (
    currentBindingApprovalRevision !== null &&
    declaredBindingApprovalRevision !== currentBindingApprovalRevision
  ) {
    errors.push("binding approval revision does not match the current image and binding metadata");
  }

  if (approvalStatus !== "APPROVED") {
    errors.push("binding metadata approval must be APPROVED");
  }

  if (
    !approvedBindingRevision ||
    approvedBindingRevision === PENDING ||
    approvedBindingRevision !== declaredBindingRevision
  ) {
    errors.push("approved binding metadata revision must equal binding metadata revision");
  }

  if (
    !approvedBindingApprovalRevision ||
    approvedBindingApprovalRevision === PENDING ||
    approvedBindingApprovalRevision !== declaredBindingApprovalRevision
  ) {
    errors.push("approved binding approval revision must equal binding approval revision");
  }

  if (!approvalEvidence || approvalEvidence === PENDING) {
    errors.push("binding metadata approval evidence/reference is required");
  } else if (
    approvedBindingApprovalRevision &&
    approvedBindingApprovalRevision !== PENDING &&
    !approvalEvidence.includes(approvedBindingApprovalRevision)
  ) {
    errors.push("approval evidence/reference must identify the approved binding approval revision");
  }

  return {
    isAuthoritative: errors.length === 0,
    errors,
    currentImageRevision,
    currentBindingMetadataRevision,
    currentBindingApprovalRevision,
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
