import { Q, type Database } from "@nozbe/watermelondb";
import { Asset, MetalHoldingState } from "@monyvi/db";
import {
  getFinancialActionUtf8ByteLength,
  MAX_ACTION_NAME_UTF8_BYTES,
  MAX_ACTION_NOTES_UTF8_BYTES,
} from "@monyvi/logic";

import {
  captureCachedModelSnapshot,
  restoreCachedModelSnapshot,
} from "./watermelon-cache-snapshot";

interface MetalMetadataValue<TValue> {
  readonly value: TValue;
  readonly writtenAt: number;
  readonly writerId: string;
}

export interface MetalMetadataState {
  readonly holdingId: string;
  readonly userId: string;
  readonly name: MetalMetadataValue<string>;
  readonly notes: MetalMetadataValue<string | null>;
}

export interface MetalMetadataPatch {
  readonly holdingId: string;
  readonly userId: string;
  readonly fields: {
    readonly name?: MetalMetadataValue<string>;
    readonly notes?: MetalMetadataValue<string | null>;
  };
}

function isValidClock(value: MetalMetadataValue<unknown>): boolean {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  return (
    Number.isSafeInteger(value.writtenAt) &&
    value.writtenAt >= 0 &&
    uuidPattern.test(value.writerId)
  );
}

function shouldReplace<TValue>(
  current: MetalMetadataValue<TValue>,
  candidate: MetalMetadataValue<TValue>
): boolean {
  return (
    candidate.writtenAt > current.writtenAt ||
    (candidate.writtenAt === current.writtenAt &&
      candidate.writerId > current.writerId)
  );
}

export function applyMetalMetadataPatch(
  current: MetalMetadataState,
  patch: MetalMetadataPatch,
  expectedUserId: string
): MetalMetadataState {
  if (patch.userId !== expectedUserId || current.userId !== expectedUserId) {
    throw new Error("foreign_metal_metadata_patch");
  }
  const keys = Object.keys(patch.fields);
  if (
    patch.holdingId !== current.holdingId ||
    keys.length === 0 ||
    keys.some((key) => key !== "name" && key !== "notes")
  ) {
    throw new Error("invalid_metal_metadata_patch");
  }
  const name = patch.fields.name;
  const notes = patch.fields.notes;
  if (
    (name &&
      (!isValidClock(name) ||
        name.value.trim().length === 0 ||
        getFinancialActionUtf8ByteLength(name.value) >
          MAX_ACTION_NAME_UTF8_BYTES)) ||
    (notes &&
      (!isValidClock(notes) ||
        (notes.value !== null &&
          (typeof notes.value !== "string" ||
            getFinancialActionUtf8ByteLength(notes.value) >
              MAX_ACTION_NOTES_UTF8_BYTES))))
  ) {
    throw new Error("invalid_metal_metadata_patch");
  }

  return Object.freeze({
    ...current,
    ...(name && shouldReplace(current.name, name)
      ? { name: Object.freeze({ ...name }) }
      : {}),
    ...(notes && shouldReplace(current.notes, notes)
      ? { notes: Object.freeze({ ...notes }) }
      : {}),
  });
}

export interface MetalMetadataServiceDependencies {
  readonly database: Database;
  readonly getCurrentUserId: () => Promise<string>;
}

export interface MetalMetadataService {
  readonly applyPatch: (
    patch: MetalMetadataPatch
  ) => Promise<{ readonly kind: "applied" | "ignored" | "replay" }>;
}

function compareClock(
  currentWrittenAt: number | null,
  currentWriterId: string | null,
  candidate: MetalMetadataValue<unknown>
): "apply" | "ignore" | "same" {
  if (currentWrittenAt === null || currentWriterId === null) return "apply";
  if (
    currentWrittenAt === candidate.writtenAt &&
    currentWriterId === candidate.writerId
  ) {
    return "same";
  }
  return candidate.writtenAt > currentWrittenAt ||
    (candidate.writtenAt === currentWrittenAt &&
      candidate.writerId > currentWriterId)
    ? "apply"
    : "ignore";
}

export function createMetalMetadataService(
  dependencies: MetalMetadataServiceDependencies
): MetalMetadataService {
  async function applyPatch(
    patch: MetalMetadataPatch
  ): Promise<{ readonly kind: "applied" | "ignored" | "replay" }> {
    const currentUserId = await dependencies.getCurrentUserId();
    if (patch.userId !== currentUserId) {
      throw new Error("foreign_metal_metadata_patch");
    }
    const validationState: MetalMetadataState = {
      holdingId: patch.holdingId,
      userId: currentUserId,
      name: { value: "baseline", writtenAt: 0, writerId: currentUserId },
      notes: { value: null, writtenAt: 0, writerId: currentUserId },
    };
    applyMetalMetadataPatch(validationState, patch, currentUserId);

    return dependencies.database.write(async () => {
      const [assets, states] = await Promise.all([
        dependencies.database
          .get<Asset>("assets")
          .query(
            Q.where("id", patch.holdingId),
            Q.where("user_id", currentUserId),
            Q.where("type", "METAL")
          )
          .fetch(),
        dependencies.database
          .get<MetalHoldingState>("metal_holding_states")
          .query(
            Q.where("holding_id", patch.holdingId),
            Q.where("user_id", currentUserId)
          )
          .fetch(),
      ]);
      const asset = assets[0];
      const state = states[0];
      if (!asset || !state) throw new Error("metal_holding_not_owned");
      if ((await dependencies.getCurrentUserId()) !== currentUserId) {
        throw new Error("financial_action_auth_scope_changed");
      }

      const nameDecision = patch.fields.name
        ? compareClock(
            state.nameWrittenAt,
            state.nameWriterId,
            patch.fields.name
          )
        : "ignore";
      const notesDecision = patch.fields.notes
        ? compareClock(
            state.notesWrittenAt,
            state.notesWriterId,
            patch.fields.notes
          )
        : "ignore";
      const hasApply = nameDecision === "apply" || notesDecision === "apply";
      if (!hasApply) {
        const isReplay =
          (!patch.fields.name ||
            (nameDecision === "same" &&
              asset.name === patch.fields.name.value)) &&
          (!patch.fields.notes ||
            (notesDecision === "same" &&
              (asset.notes ?? null) === patch.fields.notes.value));
        return Object.freeze({ kind: isReplay ? "replay" : "ignored" });
      }

      const snapshots = [
        captureCachedModelSnapshot(asset),
        captureCachedModelSnapshot(state),
      ];
      try {
        const now = new Date();
        const assetUpdate = asset.prepareUpdate((row) => {
          if (nameDecision === "apply" && patch.fields.name) {
            row.name = patch.fields.name.value;
          }
          if (notesDecision === "apply" && patch.fields.notes) {
            row.notes = patch.fields.notes.value ?? undefined;
          }
          row.updatedAt = now;
        });
        const stateUpdate = state.prepareUpdate((row) => {
          if (nameDecision === "apply" && patch.fields.name) {
            row.nameWrittenAt = patch.fields.name.writtenAt;
            row.nameWriterId = patch.fields.name.writerId;
          }
          if (notesDecision === "apply" && patch.fields.notes) {
            row.notesWrittenAt = patch.fields.notes.writtenAt;
            row.notesWriterId = patch.fields.notes.writerId;
          }
          row.updatedAt = now;
        });
        await dependencies.database.batch(assetUpdate, stateUpdate);
        return Object.freeze({ kind: "applied" as const });
      } catch (error) {
        snapshots.forEach(restoreCachedModelSnapshot);
        throw error;
      }
    });
  }

  return Object.freeze({ applyPatch });
}
