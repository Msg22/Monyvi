const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const PENDING = "PENDING";
const ATX_LEVEL_TWO_HEADING = /^ {0,3}##(?![^ \t])/;
const SETEXT_LEVEL_TWO_UNDERLINE = /^ {0,3}-+[ \t]*$/;
const BINDING_FACTS_HEADING_TEXT = "Binding Facts";
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
  const match = markdown.match(new RegExp(`^- ${escaped}:[ \\t]*(.+?)[ \\t]*$`, "m"));
  return match ? match[1] : null;
}

function atxLevelTwoHeadingText(line) {
  return line.replace(/^ {0,3}##[ \t]*/, "").replace(/[ \t]+#+[ \t]*$/, "").trim();
}

function fencedCodeOpening(line) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (!match) {
    return null;
  }

  const marker = match[1];
  if (marker[0] === "`" && match[2].includes("`")) {
    return null;
  }

  return {
    character: marker[0],
    length: marker.length,
  };
}

function isFencedCodeClosing(line, fence) {
  const match = line.match(/^ {0,3}(`+|~+)[ \t]*$/);
  return Boolean(
    match &&
      match[1][0] === fence.character &&
      match[1].length >= fence.length
  );
}

function levelTwoHeadings(lines) {
  const headings = [];
  let activeFence = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (activeFence) {
      if (isFencedCodeClosing(line, activeFence)) {
        activeFence = null;
      }
      continue;
    }

    const openingFence = fencedCodeOpening(line);
    if (openingFence) {
      activeFence = openingFence;
      continue;
    }

    if (ATX_LEVEL_TWO_HEADING.test(line)) {
      headings.push({
        startIndex: index,
        endIndex: index,
        text: atxLevelTwoHeadingText(line),
      });
      continue;
    }

    if (
      index + 1 < lines.length &&
      line.trim() &&
      !/^ {4}/.test(line) &&
      SETEXT_LEVEL_TWO_UNDERLINE.test(lines[index + 1])
    ) {
      headings.push({
        startIndex: index,
        endIndex: index + 1,
        text: line.trim(),
      });
      index += 1;
    }
  }
  return headings;
}

function splitLinesWithOffsets(buffer) {
  const lines = buffer.toString("utf8").split("\n");
  const offsets = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += Buffer.byteLength(line, "utf8") + 1;
  }
  return { lines, offsets };
}

function extractBindingFactsBytes(sidecarBytes) {
  if (sidecarBytes.includes(0x0d)) {
    throw new Error("binding sidecar must use UTF-8/LF line endings");
  }

  const { lines, offsets } = splitLinesWithOffsets(sidecarBytes);
  const headings = levelTwoHeadings(lines);
  const factsHeadings = headings.filter(
    (heading) => heading.text === BINDING_FACTS_HEADING_TEXT
  );
  if (factsHeadings.length !== 1) {
    throw new Error("binding sidecar must contain exactly one ## Binding Facts heading");
  }

  const factsHeading = factsHeadings[0];
  const factsStart =
    offsets[factsHeading.endIndex] +
    Buffer.byteLength(lines[factsHeading.endIndex], "utf8") +
    1;
  const nextHeading = headings.find((heading) => heading.startIndex > factsHeading.endIndex);
  const factsEnd = nextHeading === undefined ? sidecarBytes.length : offsets[nextHeading.startIndex];
  return sidecarBytes.subarray(factsStart, factsEnd);
}

function withoutHtmlComments(markdown) {
  return markdown.replace(/<!--[\s\S]*?(?:-->|$)/g, (comment) =>
    comment.replace(/[^\n]/g, " ")
  );
}

function withoutFencedCodeBlocks(markdown) {
  const lines = markdown.split("\n");
  let activeFence = null;

  return lines
    .map((line) => {
      if (activeFence) {
        if (isFencedCodeClosing(line, activeFence)) {
          activeFence = null;
        }
        return " ".repeat(line.length);
      }

      const openingFence = fencedCodeOpening(line);
      if (openingFence) {
        activeFence = openingFence;
        return " ".repeat(line.length);
      }

      return line;
    })
    .join("\n");
}

function validateBindingFacts(bindingFactsMarkdown) {
  const errors = [];
  const visibleBindingFactsMarkdown = withoutFencedCodeBlocks(
    withoutHtmlComments(bindingFactsMarkdown)
  );
  for (const label of REQUIRED_BINDING_FACTS) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = [
      ...visibleBindingFactsMarkdown.matchAll(
        new RegExp(`^ {0,3}[-+*][ \\t]+${escaped}:[ \\t]*(.*?)[ \\t]*$`, "gm")
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
