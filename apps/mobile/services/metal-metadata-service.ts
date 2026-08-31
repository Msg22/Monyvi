export interface MetalMetadataProjection {
  readonly name: string;
  readonly notes: string | null;
  readonly updatedAt: string;
}

function hasExactMetadataKeys(value: Readonly<Record<string, unknown>>): boolean {
  const keys = Object.keys(value).sort();
  return keys.join(",") === "name,notes,updatedAt";
}

export function applyMetalMetadataPatch(
  current: MetalMetadataProjection,
  candidate: MetalMetadataProjection
): MetalMetadataProjection {
  if (!hasExactMetadataKeys(candidate as unknown as Readonly<Record<string, unknown>>)) {
    throw new Error("invalid_metal_metadata_patch");
  }
  const currentTime = Date.parse(current.updatedAt);
  const candidateTime = Date.parse(candidate.updatedAt);
  if (!Number.isFinite(currentTime) || !Number.isFinite(candidateTime)) {
    throw new Error("invalid_metal_metadata_patch");
  }
  return Object.freeze(
    candidateTime > currentTime
      ? { ...candidate }
      : { ...current }
  );
}
