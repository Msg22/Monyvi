export function buildTestEvidenceDigest(seed: string): string {
  const hashModulus = 4_294_967_291;
  const hashMultiplier = 131;
  let hash = 0;
  for (const character of seed) {
    hash =
      (hash * hashMultiplier + (character.codePointAt(0) ?? 0)) % hashModulus;
  }

  const hashBlock = Math.trunc(hash).toString(16).padStart(8, "0");
  const lengthBlock = seed.length.toString(16).padStart(8, "0");
  return `${hashBlock}${lengthBlock}`.repeat(4);
}

export function buildTestCandidateId(seed: string): string {
  const hex = buildTestEvidenceDigest(seed);
  return `qa-candidate-${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(
    12,
    15
  )}-8${hex.slice(15, 18)}-${hex.slice(18, 30)}`;
}
