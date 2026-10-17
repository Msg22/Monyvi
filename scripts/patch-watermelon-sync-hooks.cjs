"use strict";

/**
 * Version/content-locked, reversible-attempt postinstall extension for the
 * INSTALLED @nozbe/watermelondb 0.28.0 sync implementation.
 *
 * Only the existing SDK writer/ACK seams are amended. No replacement engine,
 * dependency upgrade, native adapter changes, DB.write interception or
 * account/financial policy belongs here.
 *
 * Inputs: immutable installed bytes pinned by T069 manifest at e9f4af9.
 * Any unsupported package/version/content, partial patch or missing entrypoint
 * throws BEFORE writing installed SDK bytes. Patches are staged before renames;
 * a failed rename/write attempts a conservative rollback of completed renames.
 *
 * Call from scripts/postinstall.js. Tests use a temp-copy injection root.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PACKAGE_NAME = "@nozbe/watermelondb";
const PACKAGE_VERSION = "0.28.0";
const MONYVI_SYNC_WRITER_GUARDS =
  "monyvi/watermelon-sync-writer-guards/0.28.0/v1";
const DEFAULT_PACKAGE_DIRECTORY = path.join(
  __dirname,
  "..",
  "node_modules",
  "@nozbe",
  "watermelondb"
);

const PINNED_SHA256 = Object.freeze({
  "package.json":
    "5fe7ef04949eaf7c7e3b4e898b855d5ada51648ddb846641ebc46e271c4780fb",
  "sync/index.js":
    "6c7f6732906249d4f72fba146fb419ce34070291b27857c1b8a7eda22c89cbcb",
  "sync/impl/index.js":
    "0f47c4198cdf5b748a8536f77e99bc64ed08c0edd3fcf61f3c2d196213113c72",
  "sync/impl/applyRemote.js":
    "06d69ac70155406a6647a7323ef9a4b7d89a644d3796b6d94266f1cd2f998593",
  "sync/impl/markAsSynced.js":
    "ad0e2f0da5bfe2b5578a0158ff4db5aaeb0c8f2bb8d22e9f376c59ff1de20e45",
  "sync/impl/helpers.js":
    "c444c6c0365543d4d2beb065d6a8089d17bfe5277b73f5dc5ba9f377a1df913e",
  "src/sync/index.js":
    "578e38a7ffc9ec6b2902caadf3a6930ff0033563bfbc469fa72531f5ffc1a847",
  "src/sync/impl/index.js":
    "4ba8984f211a8cf426679ac70270c30843fe4cfb206fceac9c9fbcade89a525d",
  "src/sync/impl/applyRemote.js":
    "865a007c3eb6b56c9a6adb61067c41fc8e87e90cdfcc22e9243b1414c4d3d686",
  "src/sync/impl/markAsSynced.js":
    "1af324c2f9768894f46fe4d977ccce3f68b91d50d1b58cdc49e22bbe6511b24c",
  "sync/index.d.ts":
    "1e23769a87a59786c9345de7cbaad93385a16d05a390b4edcbb1a28107abbb56",
  "sync/impl/synchronize.js":
    "f2113f75005645f6bddb8cc245e246f8439b6a44153bf3e30c4a261cbfe4cefd",
  "src/sync/impl/synchronize.js":
    "fbaa726dfe345b336073fdd9887da6ddfd1309466d8430f3d09af5f7b90150ea",
});
const PATCHED_SHA256 = Object.freeze({
  "sync/index.js":
    "5e409d49b84ce08cd14b8676b5570fe4f88ab529730f79992fc1c7b5c57068c9",
  "src/sync/index.js":
    "fe97962e135ad11e75864a4fc5da69d22549d2a3c54ff301cd2431581ae7c3ea",
  "sync/index.d.ts":
    "62a92e93701487db364574331a3de3292f96182749b48153851992a9c2984194",
  "src/sync/impl/synchronize.js":
    "418bf755b653e9b81909bf4e5d6dd59a5f633ebf753aaa3b25a282c596a603ce",
  "sync/impl/synchronize.js":
    "9ce0610b24e810d643c6db64ce33eca74409bf5d0b7a827b465750498d7ff17a",
  "src/sync/impl/markAsSynced.js":
    "caba66cdbe06f5aa9865ba650574e4d7a37f4bcda5d03e480aa47486a3ef17f8",
  "sync/impl/markAsSynced.js":
    "296de309755a5aeb1995d6aa6448914b6b4fa47c2f6a39511714c2871d2c1ed5",
});

/**
 * EXACT source-byte replacements pinned from actual installed CJS and Flow
 * WatermelonDB source, including the real sync/index.d.ts declaration.
 * The source snapshots under .tmp are NOT a runtime/install/test dependency.
 */
const PATCH_OPERATIONS = Object.freeze({
  "sync/index.js": [
    {
      needle: "exports.synchronize = synchronize;\n",
      replacement:
        "exports.synchronize = synchronize;\nvar _monyviSyncCapability = 'monyvi/watermelon-sync-writer-guards/0.28.0/v1';\nexports.MONYVI_SYNC_WRITER_GUARDS =\n  require('./impl/synchronize').MONYVI_SYNC_WRITER_GUARDS === _monyviSyncCapability &&\n  require('./impl/markAsSynced').MONYVI_SYNC_WRITER_GUARDS === _monyviSyncCapability\n    ? _monyviSyncCapability\n    : undefined;\n",
    },
  ],
  "src/sync/index.js": [
    {
      needle: "export type Timestamp = number\n",
      replacement:
        "export type Timestamp = number\n\nconst monyviSyncCapability = 'monyvi/watermelon-sync-writer-guards/0.28.0/v1'\nexport const MONYVI_SYNC_WRITER_GUARDS: ?'monyvi/watermelon-sync-writer-guards/0.28.0/v1' =\n  require('./impl/synchronize').MONYVI_SYNC_WRITER_GUARDS === monyviSyncCapability &&\n  require('./impl/markAsSynced').MONYVI_SYNC_WRITER_GUARDS === monyviSyncCapability\n    ? monyviSyncCapability\n    : undefined\n",
    },
    {
      needle: "  pushChanges?: (SyncPushArgs) => Promise<?SyncPushResult>,\n",
      replacement:
        "  pushChanges?: (SyncPushArgs) => Promise<?SyncPushResult>,\n  beforeApplyRemoteChangesInWriter?: (SyncDatabaseChangeSet) => Promise<SyncDatabaseChangeSet>,\n  beforePullCheckpointInWriter?: () => Promise<void>,\n  beforeMarkLocalChangesAsSyncedInWriter?: (\n    SyncDatabaseChangeSet,\n    SyncRejectedIds,\n  ) => Promise<SyncRejectedIds>,\n",
    },
  ],
  "sync/index.d.ts": [
    {
      needle: "export type Timestamp = number\n",
      replacement:
        "export type Timestamp = number\n\nexport const MONYVI_SYNC_WRITER_GUARDS:\n  | 'monyvi/watermelon-sync-writer-guards/0.28.0/v1'\n  | undefined\n",
    },
    {
      needle:
        "  pushChanges?: (_: SyncPushArgs) => Promise<SyncPushResult | undefined | void>\n",
      replacement:
        "  pushChanges?: (_: SyncPushArgs) => Promise<SyncPushResult | undefined | void>\n  beforeApplyRemoteChangesInWriter?: (\n    changes: SyncDatabaseChangeSet,\n  ) => Promise<SyncDatabaseChangeSet>\n  beforePullCheckpointInWriter?: () => Promise<void>\n  beforeMarkLocalChangesAsSyncedInWriter?: (\n    changes: SyncDatabaseChangeSet,\n    rejectedIds: SyncRejectedIds,\n  ) => Promise<SyncRejectedIds>\n",
    },
  ],
  "src/sync/impl/synchronize.js": [
    {
      needle:
        "import type { SyncArgs, Timestamp, SyncPullStrategy } from '../index'\n",
      replacement:
        "import type { SyncArgs, Timestamp, SyncPullStrategy } from '../index'\n\nexport const MONYVI_SYNC_WRITER_GUARDS: 'monyvi/watermelon-sync-writer-guards/0.28.0/v1' = 'monyvi/watermelon-sync-writer-guards/0.28.0/v1'\n",
    },
    {
      needle: "  pushChanges,\n  sendCreatedAsUpdated = false,\n",
      replacement:
        "  pushChanges,\n  beforeApplyRemoteChangesInWriter,\n  beforePullCheckpointInWriter,\n  beforeMarkLocalChangesAsSyncedInWriter,\n  sendCreatedAsUpdated = false,\n",
    },
    {
      needle: "  log && (log.phase = 'starting')\n",
      replacement:
        "  log && (log.phase = 'starting')\n\n  const hasMonyviWriterGuards = !!(\n    beforeApplyRemoteChangesInWriter ||\n    beforePullCheckpointInWriter ||\n    beforeMarkLocalChangesAsSyncedInWriter\n  )\n  invariant(\n    !hasMonyviWriterGuards || (!unsafeTurbo && !_unsafeBatchPerCollection),\n    '[Sync] Monyvi writer guards require standard incremental sync (no turbo or unsafe batches)',\n  )\n",
    },
    {
      needle: "  log && (log.phase = 'pulled')\n",
      replacement:
        "  log && (log.phase = 'pulled')\n  invariant(\n    !hasMonyviWriterGuards || !('experimentalStrategy' in pullResult && pullResult.experimentalStrategy),\n    '[Sync] Monyvi writer guards do not support experimental replacement/pull strategies',\n  )\n",
    },
    {
      needle: "      await applyRemoteChanges(remoteChanges, {\n",
      replacement:
        "      const admittedRemoteChanges = beforeApplyRemoteChangesInWriter\n        ? await beforeApplyRemoteChangesInWriter(remoteChanges)\n        : remoteChanges\n      await applyRemoteChanges(admittedRemoteChanges, {\n",
    },
    {
      needle:
        "    log && (log.phase = 'applied remote changes')\n    await setLastPulledAt(database, newLastPulledAt)\n",
      replacement:
        "    log && (log.phase = 'applied remote changes')\n    if (beforePullCheckpointInWriter) {\n      await beforePullCheckpointInWriter()\n    }\n    await setLastPulledAt(database, newLastPulledAt)\n",
    },
    {
      needle:
        "      await markLocalChangesAsSynced(database, localChanges, pushResult.experimentalRejectedIds)\n",
      replacement:
        "      await markLocalChangesAsSynced(\n        database,\n        localChanges,\n        pushResult.experimentalRejectedIds,\n        beforeMarkLocalChangesAsSyncedInWriter,\n      )\n",
    },
  ],
  "sync/impl/synchronize.js": [
    {
      needle: "exports.default = synchronize;\n",
      replacement:
        "exports.default = synchronize;\nexports.MONYVI_SYNC_WRITER_GUARDS = 'monyvi/watermelon-sync-writer-guards/0.28.0/v1';\n",
    },
    {
      needle: "  pushChanges: pushChanges,\n  sendCreatedAsUpdated = false,\n",
      replacement:
        "  pushChanges: pushChanges,\n  beforeApplyRemoteChangesInWriter: beforeApplyRemoteChangesInWriter,\n  beforePullCheckpointInWriter: beforePullCheckpointInWriter,\n  beforeMarkLocalChangesAsSyncedInWriter: beforeMarkLocalChangesAsSyncedInWriter,\n  sendCreatedAsUpdated = false,\n",
    },
    {
      needle: "    log && (log.phase = 'starting');\n",
      replacement:
        "    log && (log.phase = 'starting');\n    var monyviHasWriterGuards = !!(beforeApplyRemoteChangesInWriter || beforePullCheckpointInWriter || beforeMarkLocalChangesAsSyncedInWriter);\n    if (monyviHasWriterGuards && (unsafeTurbo || _unsafeBatchPerCollection)) {\n      return $error(new Error('[Sync] Monyvi writer guards require standard incremental sync (no turbo or unsafe batches)'));\n    }\n",
    },
    {
      needle:
        "                pullResult = $await_10;\n                log && (log.phase = 'pulled');\n",
      replacement:
        "                pullResult = $await_10;\n                log && (log.phase = 'pulled');\n                if (monyviHasWriterGuards && pullResult.experimentalStrategy) {\n                  throw new Error('[Sync] Monyvi writer guards do not support experimental replacement/pull strategies');\n                }\n",
    },
    {
      needle:
        "                              return Promise.resolve((0, _index.applyRemoteChanges)(remoteChanges, {\n",
      replacement:
        "                              return Promise.resolve(beforeApplyRemoteChangesInWriter ? beforeApplyRemoteChangesInWriter(remoteChanges) : remoteChanges).then(function ($monyviAdmittedRemoteChanges) {\n                                try {\n                                  return Promise.resolve((0, _index.applyRemoteChanges)($monyviAdmittedRemoteChanges, {\n",
    },
    {
      needle:
        "                                  onDidPullChanges && onDidPullChanges(_resultRest);\n                                  return $If_3.call(this);\n                                } catch ($boundEx) {\n                                  return $error($boundEx);\n                                }\n                              }.bind(this), $error);\n",
      replacement:
        "                                  onDidPullChanges && onDidPullChanges(_resultRest);\n                                  return $If_3.call(this);\n                                } catch ($boundEx) {\n                                  return $error($boundEx);\n                                }\n                              }.bind(this), $error);\n                                } catch ($boundEx) {\n                                  return $error($boundEx);\n                                }\n                              }.bind(this), $error);\n",
    },
    {
      needle:
        "                            function $If_3() {\n                              log && (log.phase = 'applied remote changes');\n                              return Promise.resolve((0, _index.setLastPulledAt)(database, newLastPulledAt)).then(function ($await_16) {\n",
      replacement:
        "                            function $If_3() {\n                              log && (log.phase = 'applied remote changes');\n                              if (beforePullCheckpointInWriter) {\n                                return Promise.resolve(beforePullCheckpointInWriter()).then(function () {\n                                  try {\n                                    return $monyviAdvanceCheckpoint.call(this);\n                                  } catch ($boundEx) {\n                                    return $error($boundEx);\n                                  }\n                                }.bind(this), $error);\n                              }\n                              return $monyviAdvanceCheckpoint.call(this);\n                              function $monyviAdvanceCheckpoint() {\n                                return Promise.resolve((0, _index.setLastPulledAt)(database, newLastPulledAt)).then(function ($await_16) {\n",
    },
    {
      needle:
        "                              }.bind(this), $error);\n                            }\n                            return $If_3.call(this);\n",
      replacement:
        "                              }.bind(this), $error);\n                              }\n                            }\n                            return $If_3.call(this);\n",
    },
    {
      needle:
        "(0, _index.markLocalChangesAsSynced)(database, localChanges, pushResult.experimentalRejectedIds)",
      replacement:
        "(0, _index.markLocalChangesAsSynced)(database, localChanges, pushResult.experimentalRejectedIds, beforeMarkLocalChangesAsSyncedInWriter)",
    },
  ],
  "src/sync/impl/markAsSynced.js": [
    {
      needle:
        "import type { SyncLocalChanges, SyncRejectedIds } from '../index'\n",
      replacement:
        "import type { SyncDatabaseChangeSet, SyncLocalChanges, SyncRejectedIds } from '../index'\nimport type { DirtyRaw } from '../../RawRecord'\n\nexport const MONYVI_SYNC_WRITER_GUARDS: 'monyvi/watermelon-sync-writer-guards/0.28.0/v1' = 'monyvi/watermelon-sync-writer-guards/0.28.0/v1'\n",
    },
    {
      needle:
        "export default function markLocalChangesAsSynced(\n  db: Database,\n  syncedLocalChanges: SyncLocalChanges,\n  rejectedIds?: ?SyncRejectedIds,\n): Promise<void> {\n  return db.write(async () => {\n    // update and destroy records concurrently\n    await Promise.all([\n      db.batch(\n        recordsToMarkAsSynced(syncedLocalChanges, rejectedIds || {}).map(prepareMarkAsSynced),\n      ),\n      ...destroyDeletedRecords(db, syncedLocalChanges, rejectedIds || {}),\n    ])\n  }, 'sync-markLocalChangesAsSynced')\n}",
      replacement:
        "const copyRejectedIdsForHook = (source: SyncRejectedIds): SyncRejectedIds => {\n  if (!source || typeof source !== 'object' || Array.isArray(source) ||\n      (Object.getPrototypeOf(source) !== Object.prototype &&\n       Object.getPrototypeOf(source) !== null)) {\n    throw new Error('[Sync] Invalid Monyvi ACK rejected-ID response')\n  }\n  const copied: SyncRejectedIds = Object.create(null)\n  Object.keys(source).forEach((table) => {\n    const ids = source[table]\n    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {\n      throw new Error('[Sync] Invalid Monyvi ACK rejected-ID table')\n    }\n    copied[table] = ids.slice()\n  })\n  return copied\n}\n\n// The SDK's DirtyRaw consists of primitive database column values. Reject\n// unexpected nested references rather than allowing a hook to mutate an\n// original captured _raw object through a shallow copy.\nconst cloneAckCapturedRaw = (raw: DirtyRaw): DirtyRaw => {\n  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {\n    throw new Error('[Sync] Invalid Monyvi ACK captured raw')\n  }\n  const copied = { ...raw }\n  Object.keys(copied).forEach((column) => {\n    const value = copied[column]\n    if (value !== null && (typeof value === 'object' || typeof value === 'function')) {\n      throw new Error('[Sync] Invalid Monyvi ACK captured raw value')\n    }\n  })\n  return copied\n}\n\nconst copyCapturedChangesForHook = (\n  changes: SyncDatabaseChangeSet,\n): SyncDatabaseChangeSet => {\n  const copied: SyncDatabaseChangeSet = Object.create(null)\n  Object.keys(changes).forEach((table) => {\n    const captured = changes[table]\n    copied[table] = {\n      created: captured.created.map(cloneAckCapturedRaw),\n      updated: captured.updated.map(cloneAckCapturedRaw),\n      deleted: captured.deleted.slice(),\n    }\n  })\n  return copied\n}\n\nconst unionRejectedIds = (\n  originalBaseline: SyncRejectedIds,\n  proposedAdditions: SyncRejectedIds,\n): SyncRejectedIds => {\n  // Validate the entire callback result (including [] / null / scalar and\n  // non-string ID arrays) before selecting records or destroying tombstones.\n  const added = copyRejectedIdsForHook(proposedAdditions)\n  const union = copyRejectedIdsForHook(originalBaseline)\n  Object.keys(added).forEach((table) => {\n    union[table] = [...new Set([...(union[table] || []), ...added[table]])]\n  })\n  return union\n}\n\nexport default function markLocalChangesAsSynced(\n  db: Database,\n  syncedLocalChanges: SyncLocalChanges,\n  rejectedIds?: ?SyncRejectedIds,\n  beforeMarkLocalChangesAsSyncedInWriter?: (\n    SyncDatabaseChangeSet,\n    SyncRejectedIds,\n  ) => Promise<SyncRejectedIds>,\n): Promise<void> {\n  return db.write(async () => {\n    const priorRejectedIds = rejectedIds || {}\n    let effectiveRejectedIds = priorRejectedIds\n    if (beforeMarkLocalChangesAsSyncedInWriter) {\n      // Save an independent transport baseline. The callback receives *another*\n      // copy and can neither erase prior rejected IDs nor rewrite captured\n      // raws later consumed by the stock equality comparator.\n      const baseline = copyRejectedIdsForHook(priorRejectedIds)\n      const hookRejectedIds = copyRejectedIdsForHook(baseline)\n      const hookChanges = copyCapturedChangesForHook(syncedLocalChanges.changes)\n      const additions = await beforeMarkLocalChangesAsSyncedInWriter(\n        hookChanges,\n        hookRejectedIds,\n      )\n      effectiveRejectedIds = unionRejectedIds(baseline, additions)\n    }\n\n    // Keep the stock actual ACK writer and its raw-equality / reset behavior.\n    await Promise.all([\n      db.batch(\n        recordsToMarkAsSynced(syncedLocalChanges, effectiveRejectedIds).map(prepareMarkAsSynced),\n      ),\n      ...destroyDeletedRecords(db, syncedLocalChanges, effectiveRejectedIds),\n    ])\n  }, 'sync-markLocalChangesAsSynced')\n}",
    },
  ],
  "sync/impl/markAsSynced.js": [
    {
      needle: "exports.default = markLocalChangesAsSynced;\n",
      replacement:
        "exports.default = markLocalChangesAsSynced;\nexports.MONYVI_SYNC_WRITER_GUARDS = 'monyvi/watermelon-sync-writer-guards/0.28.0/v1';\n",
    },
    {
      needle:
        "function markLocalChangesAsSynced(db, syncedLocalChanges, rejectedIds) {\n  return db.write(function () {\n    return new Promise(function ($return, $error) {\n      return Promise.resolve(Promise.all([db.batch(recordsToMarkAsSynced(syncedLocalChanges, rejectedIds || {}).map(_helpers.prepareMarkAsSynced))].concat((0, _toConsumableArray2.default)(destroyDeletedRecords(db, syncedLocalChanges, rejectedIds || {}))))).then(function () {\n        try {\n          return $return();\n        } catch ($boundEx) {\n          return $error($boundEx);\n        }\n      }, $error);\n    });\n  }, 'sync-markLocalChangesAsSynced');\n}",
      replacement:
        "function monyviCopyRejectedIds(source) {\n  if (!source || typeof source !== 'object' || Array.isArray(source) ||\n      (Object.getPrototypeOf(source) !== Object.prototype &&\n       Object.getPrototypeOf(source) !== null)) {\n    throw new Error('[Sync] Invalid Monyvi ACK rejected-ID response');\n  }\n  var copy = Object.create(null);\n  Object.keys(source).forEach(function (table) {\n    var ids = source[table];\n    if (!Array.isArray(ids) || !ids.every(function (id) { return typeof id === 'string'; })) {\n      throw new Error('[Sync] Invalid Monyvi ACK rejected-ID table');\n    }\n    copy[table] = ids.slice();\n  });\n  return copy;\n}\nfunction monyviCopyCapturedChanges(changes) {\n  var copy = Object.create(null);\n  function copyRaw(raw) {\n    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {\n      throw new Error('[Sync] Invalid Monyvi ACK captured raw');\n    }\n    var rawCopy = Object.create(null);\n    Object.keys(raw).forEach(function (column) {\n      var value = raw[column];\n      if (value !== null && (typeof value === 'object' || typeof value === 'function')) {\n        throw new Error('[Sync] Invalid Monyvi ACK captured raw value');\n      }\n      rawCopy[column] = value;\n    });\n    return rawCopy;\n  }\n  Object.keys(changes).forEach(function (table) {\n    var tableChanges = changes[table];\n    copy[table] = {\n      created: tableChanges.created.map(copyRaw),\n      updated: tableChanges.updated.map(copyRaw),\n      deleted: tableChanges.deleted.slice()\n    };\n  });\n  return copy;\n}\nfunction monyviUnionRejectedIds(originalBaseline, proposedAdditions) {\n  // Keep the callback's additions and original transport baseline independent.\n  // All validation completes before ANY stock ACK or tombstone destruction.\n  var additions = monyviCopyRejectedIds(proposedAdditions);\n  var union = monyviCopyRejectedIds(originalBaseline);\n  Object.keys(additions).forEach(function (table) {\n    union[table] = Array.from(new Set((union[table] || []).concat(additions[table])));\n  });\n  return union;\n}\nfunction markLocalChangesAsSynced(db, syncedLocalChanges, rejectedIds, beforeMarkLocalChangesAsSyncedInWriter) {\n  return db.write(function () {\n    return new Promise(function ($return, $error) {\n      var existingRejectedIds = rejectedIds || {};\n      function monyviCompleteAck(effectiveRejectedIds) {\n        return Promise.resolve(Promise.all([db.batch(recordsToMarkAsSynced(syncedLocalChanges, effectiveRejectedIds).map(_helpers.prepareMarkAsSynced))].concat((0, _toConsumableArray2.default)(destroyDeletedRecords(db, syncedLocalChanges, effectiveRejectedIds))))).then(function () {\n          try {\n            return $return();\n          } catch ($boundEx) {\n            return $error($boundEx);\n          }\n        }, $error);\n      }\n      if (beforeMarkLocalChangesAsSyncedInWriter) {\n        var protectedBaseline, hookRejectedIds, hookChanges, proposed;\n        try {\n          protectedBaseline = monyviCopyRejectedIds(existingRejectedIds);\n          hookRejectedIds = monyviCopyRejectedIds(protectedBaseline);\n          hookChanges = monyviCopyCapturedChanges(syncedLocalChanges.changes);\n          proposed = beforeMarkLocalChangesAsSyncedInWriter(hookChanges, hookRejectedIds);\n        } catch (error) {\n          return $error(error);\n        }\n        return Promise.resolve(proposed).then(function (extraRejectedIds) {\n          try {\n            return monyviCompleteAck(monyviUnionRejectedIds(protectedBaseline, extraRejectedIds));\n          } catch (error) {\n            return $error(error);\n          }\n        }, $error);\n      }\n      // No hook: preserve stock captured image, raw equality and rejection set.\n      return monyviCompleteAck(existingRejectedIds);\n    });\n  }, 'sync-markLocalChangesAsSynced');\n}",
    },
  ],
});

/** The installed original and v1 patched hashes stay pinned. The v2 snapshot
 * postimage must reverse through THESE exact anchors to the trusted v1 SHA.
 * This permits idempotence and an upgrade from an existing v1 installation
 * without accepting an unknown SDK byte or changing the writer guards.
 */
const SNAPSHOT_COMPAT_OPERATIONS = Object.freeze({
  "src/sync/impl/synchronize.js": [
    {
      needle:
        "export const MONYVI_SYNC_WRITER_GUARDS: 'monyvi/watermelon-sync-writer-guards/0.28.0/v1' = 'monyvi/watermelon-sync-writer-guards/0.28.0/v1'\n",
      replacement:
        "export const MONYVI_SYNC_WRITER_GUARDS: 'monyvi/watermelon-sync-writer-guards/0.28.0/v1' = 'monyvi/watermelon-sync-writer-guards/0.28.0/v1'\n\nfunction monyviApproveSnapshotReplacement(pullResult: any, timestamp: number): boolean {\n  // Only PR385's three per-owner, time-bounded, clean snapshot tables.\n  // The protected SDK writer and its checkpoint/ACK callbacks remain active.\n  const tables = [\n    'daily_snapshot_assets',\n    'daily_snapshot_balance',\n    'daily_snapshot_net_worth',\n  ];\n  const plain = (value) => {\n    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;\n    const prototype = Object.getPrototypeOf(value);\n    // Cross-realm plain Q.where objects may have a foreign Object.prototype.\n    return prototype === null || prototype === Object.prototype ||\n      (prototype && Object.getPrototypeOf(prototype) === null);\n  };\n  const exact = (value, keys) => plain(value) &&\n    Object.keys(value).length === keys.length &&\n    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));\n  try {\n    const strategy = pullResult.experimentalStrategy;\n    if (!exact(strategy, ['default', 'override', 'experimentalQueryRecordsForReplacement']) ||\n      strategy.default !== 'incremental' ||\n      !exact(strategy.override, tables) ||\n      !exact(strategy.experimentalQueryRecordsForReplacement, tables) ||\n      !tables.every((table) => strategy.override[table] === 'replacement')) {\n      return false;\n    }\n    const query = strategy.experimentalQueryRecordsForReplacement[tables[0]];\n    if (typeof query !== 'function' ||\n      !tables.every((table) =>\n        strategy.experimentalQueryRecordsForReplacement[table] === query)) return false;\n\n    const clauses = query();\n    if (!Array.isArray(clauses) || clauses.length !== 4) return false;\n    const names = ['user_id', 'created_at', 'created_at', '_status'];\n    const operators = ['eq', 'gt', 'lte', 'eq'];\n    const values = [];\n    for (let i = 0; i < clauses.length; i++) {\n      const clause = clauses[i];\n      if (!exact(clause, ['type', 'left', 'comparison']) ||\n        clause.type !== 'where' || clause.left !== names[i] ||\n        !exact(clause.comparison, ['operator', 'right']) ||\n        clause.comparison.operator !== operators[i] ||\n        !exact(clause.comparison.right, ['value'])) return false;\n      values.push(clause.comparison.right.value);\n    }\n    const [ownerId, cutoff, upper, status] = values;\n    if (typeof ownerId !== 'string' || !ownerId.trim() ||\n      ownerId !== ownerId.trim() || !Number.isSafeInteger(cutoff) ||\n      !Number.isSafeInteger(upper) || !Number.isSafeInteger(timestamp) ||\n      upper !== timestamp ||\n      status !== 'synced') return false;\n\n    // Capture only the validated Watermelon Q.where scalar clauses. Subsequent\n    // SDK queries cannot invoke a stateful or later-replaced source callback.\n    const pinned = values.slice();\n    const verifiedQuery = () =>\n      pinned.map((value, index) => ({\n        type: 'where',\n        left: names[index],\n        comparison: { operator: operators[index], right: { value } },\n      }));\n    const override = Object.freeze(Object.fromEntries(\n      tables.map((table) => [table, 'replacement'])\n    ));\n    const queries = Object.freeze(Object.fromEntries(\n      tables.map((table) => [table, verifiedQuery])\n    ));\n    const approved = Object.freeze({\n      default: 'incremental',\n      override,\n      experimentalQueryRecordsForReplacement: queries,\n    });\n    // Fail closed if pullResult is frozen/non-configurable. Prevent any\n    // replacement of the approved scoped strategy between admission and apply.\n    Object.defineProperty(pullResult, 'experimentalStrategy', {\n      value: approved, enumerable: true, writable: false, configurable: false,\n    });\n    return true;\n  } catch (_) {\n    return false;\n  }\n}\n",
    },
    {
      needle:
        "  invariant(\n    !hasMonyviWriterGuards || !('experimentalStrategy' in pullResult && pullResult.experimentalStrategy),\n    '[Sync] Monyvi writer guards do not support experimental replacement/pull strategies',\n  )\n",
      replacement:
        "  invariant(\n    !hasMonyviWriterGuards || !('experimentalStrategy' in pullResult && pullResult.experimentalStrategy) ||\n      monyviApproveSnapshotReplacement((pullResult: any), (pullResult: any).timestamp),\n    '[Sync] Monyvi writer guards reject unsupported experimental replacement/pull strategies',\n  )\n",
    },
  ],
  "sync/impl/synchronize.js": [
    {
      needle:
        "exports.MONYVI_SYNC_WRITER_GUARDS = 'monyvi/watermelon-sync-writer-guards/0.28.0/v1';\n",
      replacement:
        "exports.MONYVI_SYNC_WRITER_GUARDS = 'monyvi/watermelon-sync-writer-guards/0.28.0/v1';\n\nfunction monyviApproveSnapshotReplacement(pullResult, timestamp) {\n  // Only PR385's three per-owner, time-bounded, clean snapshot tables.\n  // The protected SDK writer and its checkpoint/ACK callbacks remain active.\n  const tables = [\n    'daily_snapshot_assets',\n    'daily_snapshot_balance',\n    'daily_snapshot_net_worth',\n  ];\n  const plain = (value) => {\n    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;\n    const prototype = Object.getPrototypeOf(value);\n    // Cross-realm plain Q.where objects may have a foreign Object.prototype.\n    return prototype === null || prototype === Object.prototype ||\n      (prototype && Object.getPrototypeOf(prototype) === null);\n  };\n  const exact = (value, keys) => plain(value) &&\n    Object.keys(value).length === keys.length &&\n    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));\n  try {\n    const strategy = pullResult.experimentalStrategy;\n    if (!exact(strategy, ['default', 'override', 'experimentalQueryRecordsForReplacement']) ||\n      strategy.default !== 'incremental' ||\n      !exact(strategy.override, tables) ||\n      !exact(strategy.experimentalQueryRecordsForReplacement, tables) ||\n      !tables.every((table) => strategy.override[table] === 'replacement')) {\n      return false;\n    }\n    const query = strategy.experimentalQueryRecordsForReplacement[tables[0]];\n    if (typeof query !== 'function' ||\n      !tables.every((table) =>\n        strategy.experimentalQueryRecordsForReplacement[table] === query)) return false;\n\n    const clauses = query();\n    if (!Array.isArray(clauses) || clauses.length !== 4) return false;\n    const names = ['user_id', 'created_at', 'created_at', '_status'];\n    const operators = ['eq', 'gt', 'lte', 'eq'];\n    const values = [];\n    for (let i = 0; i < clauses.length; i++) {\n      const clause = clauses[i];\n      if (!exact(clause, ['type', 'left', 'comparison']) ||\n        clause.type !== 'where' || clause.left !== names[i] ||\n        !exact(clause.comparison, ['operator', 'right']) ||\n        clause.comparison.operator !== operators[i] ||\n        !exact(clause.comparison.right, ['value'])) return false;\n      values.push(clause.comparison.right.value);\n    }\n    const [ownerId, cutoff, upper, status] = values;\n    if (typeof ownerId !== 'string' || !ownerId.trim() ||\n      ownerId !== ownerId.trim() || !Number.isSafeInteger(cutoff) ||\n      !Number.isSafeInteger(upper) || !Number.isSafeInteger(timestamp) ||\n      upper !== timestamp ||\n      status !== 'synced') return false;\n\n    // Capture only the validated Watermelon Q.where scalar clauses. Subsequent\n    // SDK queries cannot invoke a stateful or later-replaced source callback.\n    const pinned = values.slice();\n    const verifiedQuery = () =>\n      pinned.map((value, index) => ({\n        type: 'where',\n        left: names[index],\n        comparison: { operator: operators[index], right: { value } },\n      }));\n    const override = Object.freeze(Object.fromEntries(\n      tables.map((table) => [table, 'replacement'])\n    ));\n    const queries = Object.freeze(Object.fromEntries(\n      tables.map((table) => [table, verifiedQuery])\n    ));\n    const approved = Object.freeze({\n      default: 'incremental',\n      override,\n      experimentalQueryRecordsForReplacement: queries,\n    });\n    // Fail closed if pullResult is frozen/non-configurable. Prevent any\n    // replacement of the approved scoped strategy between admission and apply.\n    Object.defineProperty(pullResult, 'experimentalStrategy', {\n      value: approved, enumerable: true, writable: false, configurable: false,\n    });\n    return true;\n  } catch (_) {\n    return false;\n  }\n}\n",
    },
    {
      needle:
        "                if (monyviHasWriterGuards && pullResult.experimentalStrategy) {\n                  throw new Error('[Sync] Monyvi writer guards do not support experimental replacement/pull strategies');\n                }\n",
      replacement:
        "                if (monyviHasWriterGuards && pullResult.experimentalStrategy &&\n                    !monyviApproveSnapshotReplacement(pullResult, pullResult.timestamp)) {\n                  throw new Error('[Sync] Monyvi writer guards reject unsupported experimental replacement/pull strategies');\n                }\n",
    },
  ],
});
const PRIOR_SNAPSHOT_COMPAT_OPERATIONS = Object.freeze({
  "src/sync/impl/synchronize.js": [
    {
      needle:
        "export const MONYVI_SYNC_WRITER_GUARDS: 'monyvi/watermelon-sync-writer-guards/0.28.0/v1' = 'monyvi/watermelon-sync-writer-guards/0.28.0/v1'\n",
      replacement:
        "export const MONYVI_SYNC_WRITER_GUARDS: 'monyvi/watermelon-sync-writer-guards/0.28.0/v1' = 'monyvi/watermelon-sync-writer-guards/0.28.0/v1'\n\nfunction monyviApproveSnapshotReplacement(pullResult: any, timestamp: number): boolean {\n  // Only PR385's three per-owner, time-bounded, clean snapshot tables.\n  // The protected SDK writer and its checkpoint/ACK callbacks remain active.\n  const tables = [\n    'daily_snapshot_assets',\n    'daily_snapshot_balance',\n    'daily_snapshot_net_worth',\n  ];\n  const plain = (value) => {\n    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;\n    const prototype = Object.getPrototypeOf(value);\n    // Cross-realm plain Q.where objects may have a foreign Object.prototype.\n    return prototype === null || prototype === Object.prototype ||\n      (prototype && Object.getPrototypeOf(prototype) === null);\n  };\n  const exact = (value, keys) => plain(value) &&\n    Object.keys(value).length === keys.length &&\n    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));\n  try {\n    const strategy = pullResult.experimentalStrategy;\n    if (!exact(strategy, ['default', 'override', 'experimentalQueryRecordsForReplacement']) ||\n      strategy.default !== 'incremental' ||\n      !exact(strategy.override, tables) ||\n      !exact(strategy.experimentalQueryRecordsForReplacement, tables) ||\n      !tables.every((table) => strategy.override[table] === 'replacement')) {\n      return false;\n    }\n    const query = strategy.experimentalQueryRecordsForReplacement[tables[0]];\n    if (typeof query !== 'function' ||\n      !tables.every((table) =>\n        strategy.experimentalQueryRecordsForReplacement[table] === query)) return false;\n\n    const clauses = query();\n    if (!Array.isArray(clauses) || clauses.length !== 4) return false;\n    const names = ['user_id', 'created_at', 'created_at', '_status'];\n    const operators = ['eq', 'gt', 'lte', 'eq'];\n    const values = [];\n    for (let i = 0; i < clauses.length; i++) {\n      const clause = clauses[i];\n      if (!exact(clause, ['type', 'left', 'comparison']) ||\n        clause.type !== 'where' || clause.left !== names[i] ||\n        !exact(clause.comparison, ['operator', 'right']) ||\n        clause.comparison.operator !== operators[i] ||\n        !exact(clause.comparison.right, ['value'])) return false;\n      values.push(clause.comparison.right.value);\n    }\n    const [ownerId, cutoff, upper, status] = values;\n    if (typeof ownerId !== 'string' || !ownerId.trim() ||\n      ownerId !== ownerId.trim() || !Number.isSafeInteger(cutoff) ||\n      !Number.isSafeInteger(upper) || !Number.isSafeInteger(timestamp) ||\n      cutoff >= upper || upper !== timestamp ||\n      status !== 'synced') return false;\n\n    // Capture only the validated Watermelon Q.where scalar clauses. Subsequent\n    // SDK queries cannot invoke a stateful or later-replaced source callback.\n    const pinned = values.slice();\n    const verifiedQuery = () =>\n      pinned.map((value, index) => ({\n        type: 'where',\n        left: names[index],\n        comparison: { operator: operators[index], right: { value } },\n      }));\n    const override = Object.freeze(Object.fromEntries(\n      tables.map((table) => [table, 'replacement'])\n    ));\n    const queries = Object.freeze(Object.fromEntries(\n      tables.map((table) => [table, verifiedQuery])\n    ));\n    const approved = Object.freeze({\n      default: 'incremental',\n      override,\n      experimentalQueryRecordsForReplacement: queries,\n    });\n    // Fail closed if pullResult is frozen/non-configurable. Prevent any\n    // replacement of the approved scoped strategy between admission and apply.\n    Object.defineProperty(pullResult, 'experimentalStrategy', {\n      value: approved, enumerable: true, writable: false, configurable: false,\n    });\n    return true;\n  } catch (_) {\n    return false;\n  }\n}\n",
    },
    {
      needle:
        "  invariant(\n    !hasMonyviWriterGuards || !('experimentalStrategy' in pullResult && pullResult.experimentalStrategy),\n    '[Sync] Monyvi writer guards do not support experimental replacement/pull strategies',\n  )\n",
      replacement:
        "  invariant(\n    !hasMonyviWriterGuards || !('experimentalStrategy' in pullResult && pullResult.experimentalStrategy) ||\n      monyviApproveSnapshotReplacement((pullResult: any), (pullResult: any).timestamp),\n    '[Sync] Monyvi writer guards reject unsupported experimental replacement/pull strategies',\n  )\n",
    },
  ],
  "sync/impl/synchronize.js": [
    {
      needle:
        "exports.MONYVI_SYNC_WRITER_GUARDS = 'monyvi/watermelon-sync-writer-guards/0.28.0/v1';\n",
      replacement:
        "exports.MONYVI_SYNC_WRITER_GUARDS = 'monyvi/watermelon-sync-writer-guards/0.28.0/v1';\n\nfunction monyviApproveSnapshotReplacement(pullResult, timestamp) {\n  // Only PR385's three per-owner, time-bounded, clean snapshot tables.\n  // The protected SDK writer and its checkpoint/ACK callbacks remain active.\n  const tables = [\n    'daily_snapshot_assets',\n    'daily_snapshot_balance',\n    'daily_snapshot_net_worth',\n  ];\n  const plain = (value) => {\n    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;\n    const prototype = Object.getPrototypeOf(value);\n    // Cross-realm plain Q.where objects may have a foreign Object.prototype.\n    return prototype === null || prototype === Object.prototype ||\n      (prototype && Object.getPrototypeOf(prototype) === null);\n  };\n  const exact = (value, keys) => plain(value) &&\n    Object.keys(value).length === keys.length &&\n    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));\n  try {\n    const strategy = pullResult.experimentalStrategy;\n    if (!exact(strategy, ['default', 'override', 'experimentalQueryRecordsForReplacement']) ||\n      strategy.default !== 'incremental' ||\n      !exact(strategy.override, tables) ||\n      !exact(strategy.experimentalQueryRecordsForReplacement, tables) ||\n      !tables.every((table) => strategy.override[table] === 'replacement')) {\n      return false;\n    }\n    const query = strategy.experimentalQueryRecordsForReplacement[tables[0]];\n    if (typeof query !== 'function' ||\n      !tables.every((table) =>\n        strategy.experimentalQueryRecordsForReplacement[table] === query)) return false;\n\n    const clauses = query();\n    if (!Array.isArray(clauses) || clauses.length !== 4) return false;\n    const names = ['user_id', 'created_at', 'created_at', '_status'];\n    const operators = ['eq', 'gt', 'lte', 'eq'];\n    const values = [];\n    for (let i = 0; i < clauses.length; i++) {\n      const clause = clauses[i];\n      if (!exact(clause, ['type', 'left', 'comparison']) ||\n        clause.type !== 'where' || clause.left !== names[i] ||\n        !exact(clause.comparison, ['operator', 'right']) ||\n        clause.comparison.operator !== operators[i] ||\n        !exact(clause.comparison.right, ['value'])) return false;\n      values.push(clause.comparison.right.value);\n    }\n    const [ownerId, cutoff, upper, status] = values;\n    if (typeof ownerId !== 'string' || !ownerId.trim() ||\n      ownerId !== ownerId.trim() || !Number.isSafeInteger(cutoff) ||\n      !Number.isSafeInteger(upper) || !Number.isSafeInteger(timestamp) ||\n      cutoff >= upper || upper !== timestamp ||\n      status !== 'synced') return false;\n\n    // Capture only the validated Watermelon Q.where scalar clauses. Subsequent\n    // SDK queries cannot invoke a stateful or later-replaced source callback.\n    const pinned = values.slice();\n    const verifiedQuery = () =>\n      pinned.map((value, index) => ({\n        type: 'where',\n        left: names[index],\n        comparison: { operator: operators[index], right: { value } },\n      }));\n    const override = Object.freeze(Object.fromEntries(\n      tables.map((table) => [table, 'replacement'])\n    ));\n    const queries = Object.freeze(Object.fromEntries(\n      tables.map((table) => [table, verifiedQuery])\n    ));\n    const approved = Object.freeze({\n      default: 'incremental',\n      override,\n      experimentalQueryRecordsForReplacement: queries,\n    });\n    // Fail closed if pullResult is frozen/non-configurable. Prevent any\n    // replacement of the approved scoped strategy between admission and apply.\n    Object.defineProperty(pullResult, 'experimentalStrategy', {\n      value: approved, enumerable: true, writable: false, configurable: false,\n    });\n    return true;\n  } catch (_) {\n    return false;\n  }\n}\n",
    },
    {
      needle:
        "                if (monyviHasWriterGuards && pullResult.experimentalStrategy) {\n                  throw new Error('[Sync] Monyvi writer guards do not support experimental replacement/pull strategies');\n                }\n",
      replacement:
        "                if (monyviHasWriterGuards && pullResult.experimentalStrategy &&\n                    !monyviApproveSnapshotReplacement(pullResult, pullResult.timestamp)) {\n                  throw new Error('[Sync] Monyvi writer guards reject unsupported experimental replacement/pull strategies');\n                }\n",
    },
  ],
});
const SNAPSHOT_COMPAT_PATHS = Object.freeze(
  Object.keys(SNAPSHOT_COMPAT_OPERATIONS)
);

const PATCH_PATHS = Object.freeze(Object.keys(PATCH_OPERATIONS));

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function fail(message) {
  throw new Error("[watermelon-sync-hooks] " + message);
}

/** Verify the v2 postimage by reversing *only* its two exact bounded
 * extensions to the already SHA-pinned v1 SDK postimage. This is a content
 * commitment, not arbitrary acceptance of a changed installed module.
 */
function reverseKnownPostimageToV1(relative, bytes, operations) {
  if (!operations) return null;
  let current = bytes.toString("utf8");
  if (!Buffer.from(current, "utf8").equals(bytes)) return null;
  for (const { needle, replacement } of [...operations].reverse()) {
    if (current.split(replacement).length - 1 !== 1) return null;
    current = current.replace(replacement, needle);
  }
  const reversed = Buffer.from(current, "utf8");
  return sha256(reversed) === PATCHED_SHA256[relative] ? reversed : null;
}

function isSnapshotCompatiblePostimage(relative, bytes) {
  return (
    reverseKnownPostimageToV1(
      relative,
      bytes,
      SNAPSHOT_COMPAT_OPERATIONS[relative]
    ) !== null
  );
}

function isPriorSnapshotCompatiblePostimage(relative, bytes) {
  return (
    reverseKnownPostimageToV1(
      relative,
      bytes,
      PRIOR_SNAPSHOT_COMPAT_OPERATIONS[relative]
    ) !== null
  );
}

function isExpectedFinalPostimage(relative, bytes) {
  return SNAPSHOT_COMPAT_OPERATIONS[relative]
    ? isSnapshotCompatiblePostimage(relative, bytes)
    : sha256(bytes) === PATCHED_SHA256[relative];
}

/** Convert an authenticated v1 SDK postimage to its scoped snapshot-capable
 * postimage; fail if any v1 source byte or two exact injection anchors differ.
 */
function applySnapshotCompatibility(relative, baseBytes) {
  const operations = SNAPSHOT_COMPAT_OPERATIONS[relative];
  if (!operations) return baseBytes;
  if (sha256(baseBytes) !== PATCHED_SHA256[relative])
    fail("Untrusted v1 snapshot compatibility input: " + relative);
  let result = baseBytes.toString("utf8");
  for (const { needle, replacement } of operations) {
    const count = result.split(needle).length - 1;
    if (count !== 1)
      fail(
        "Non-unique bounded snapshot SDK anchor: " +
          relative +
          " count=" +
          count
      );
    result = result.replace(needle, replacement);
  }
  const bytes = Buffer.from(result, "utf8");
  if (!isSnapshotCompatiblePostimage(relative, bytes))
    fail("Unexpected derived snapshot SDK postimage: " + relative);
  return bytes;
}

/** Canonicalize and confirm the expected scoped package directory. */
function packageRoot(directory, io) {
  const root = io.realpathSync(path.resolve(directory));
  if (
    path.basename(root) !== "watermelondb" ||
    path.basename(path.dirname(root)) !== "@nozbe"
  ) {
    fail("Refusing non-@nozbe/watermelondb package path: " + root);
  }
  return root;
}

function checkedPath(root, relative) {
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(root + path.sep)) {
    fail("Path escapes verified Watermelon package: " + relative);
  }
  return absolute;
}

function readKnownFile(root, relative, io) {
  const absolute = checkedPath(root, relative);
  const stat = io.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail("Expected a real regular file (not a symlink): " + relative);
  }
  const realPath = io.realpathSync(absolute);
  if (realPath !== absolute || !realPath.startsWith(root + path.sep)) {
    fail("File redirects outside verified package: " + relative);
  }
  return {
    path: absolute,
    bytes: io.readFileSync(absolute),
    mode: stat.mode & 0o777,
  };
}

function assertAbsent(root, relative, io) {
  const absolute = checkedPath(root, relative);
  try {
    io.lstatSync(absolute);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  fail("Unexpected entrypoint exists (pinned absent): " + relative);
}

/**
 * Inspect every manifest-pinned file BEFORE any installed-file writes.
 * Seven touched files must be entirely pristine, v1 patched or v2 snapshot-patched.
 * Other pinned files remain byte-exact; src/sync/index.d.ts stays absent.
 */
function preflight(root, io) {
  const files = new Map();
  const packageFile = readKnownFile(root, "package.json", io);
  let installed;
  try {
    installed = JSON.parse(packageFile.bytes.toString("utf8"));
  } catch (error) {
    fail("Invalid installed Watermelon package.json: " + error.message);
  }
  if (
    installed.name !== PACKAGE_NAME ||
    installed.version !== PACKAGE_VERSION
  ) {
    fail(
      "Wrong Watermelon installation: expected " +
        PACKAGE_NAME +
        "@" +
        PACKAGE_VERSION +
        ", found " +
        installed.name +
        "@" +
        installed.version
    );
  }
  let pristine = 0;
  let legacyPatched = 0;
  let snapshotPatched = 0;
  let priorPatched = 0;
  for (const [relative, expected] of Object.entries(PINNED_SHA256)) {
    const file =
      relative === "package.json"
        ? packageFile
        : readKnownFile(root, relative, io);
    const actual = sha256(file.bytes);
    const knownPostHash = PATCHED_SHA256[relative];
    if (actual === expected) {
      if (knownPostHash) pristine++;
    } else if (knownPostHash && actual === knownPostHash) {
      legacyPatched++;
    } else if (
      SNAPSHOT_COMPAT_OPERATIONS[relative] &&
      isSnapshotCompatiblePostimage(relative, file.bytes)
    ) {
      snapshotPatched++;
    } else if (
      PRIOR_SNAPSHOT_COMPAT_OPERATIONS[relative] &&
      isPriorSnapshotCompatiblePostimage(relative, file.bytes)
    ) {
      priorPatched++;
      file.v1Bytes = reverseKnownPostimageToV1(
        relative,
        file.bytes,
        PRIOR_SNAPSHOT_COMPAT_OPERATIONS[relative]
      );
    } else {
      fail("Unknown installed content: " + relative + " sha256=" + actual);
    }
    files.set(relative, file);
  }
  assertAbsent(root, "src/sync/index.d.ts", io);
  const original = pristine === PATCH_PATHS.length;
  const legacy = legacyPatched === PATCH_PATHS.length;
  const current =
    snapshotPatched === SNAPSHOT_COMPAT_PATHS.length &&
    legacyPatched === PATCH_PATHS.length - SNAPSHOT_COMPAT_PATHS.length;
  const prior =
    priorPatched === SNAPSHOT_COMPAT_PATHS.length &&
    legacyPatched === PATCH_PATHS.length - SNAPSHOT_COMPAT_PATHS.length;
  if (!original && !legacy && !current && !prior) {
    fail(
      "Mixed/incomplete SDK patch (original=" +
        pristine +
        ", v1=" +
        legacyPatched +
        ", snapshot=" +
        snapshotPatched +
        ", prior=" +
        priorPatched +
        ")"
    );
  }
  return {
    files,
    state: current
      ? "already-patched"
      : prior
        ? "prior-patched"
        : legacy
          ? "legacy-patched"
          : "original",
  };
}

function convertPinnedSource(relative, originalBytes) {
  let output = originalBytes.toString("utf8");
  if (!Buffer.from(output, "utf8").equals(originalBytes)) {
    fail("Pinned SDK file is not exact UTF-8: " + relative);
  }
  for (const { needle, replacement } of PATCH_OPERATIONS[relative]) {
    const count = output.split(needle).length - 1;
    if (count !== 1) {
      fail(
        "Non-unique expected SDK source anchor in " + relative + ": " + count
      );
    }
    output = output.replace(needle, replacement);
  }
  const bytes = Buffer.from(output, "utf8");
  const actual = sha256(bytes);
  if (actual !== PATCHED_SHA256[relative]) {
    fail("Generated SDK postimage mismatch: " + relative + " sha256=" + actual);
  }
  return applySnapshotCompatibility(relative, bytes);
}

function tempPathFor(file, token, number) {
  return path.join(
    path.dirname(file.path),
    "." +
      path.basename(file.path) +
      ".monyvi-sync-" +
      token +
      "-" +
      number +
      ".tmp"
  );
}

function unlinkStaged(paths, io) {
  for (const file of paths) {
    try {
      io.unlinkSync(file);
    } catch (error) {
      if (!error || error.code !== "ENOENT") {
        // Cleanup is best effort; a named temp path cannot affect SDK runtime.
      }
    }
  }
}

/**
 * The only mutation entrypoint. Tests may inject filesystem IO and a separate
 * temporary @nozbe/watermelondb directory; the default is installed package.
 */
function patchWatermelonSyncHooks(
  directory = DEFAULT_PACKAGE_DIRECTORY,
  io = fs
) {
  const root = packageRoot(directory, io);
  const inspected = preflight(root, io);
  if (inspected.state === "already-patched") {
    return { status: "already-patched", files: PATCH_PATHS.length };
  }

  // v1 installations upgrade only the two exact snapshot guard files. A
  // pristine install still stages all seven existing SDK writer hook files.
  const workPaths =
    inspected.state === "legacy-patched" || inspected.state === "prior-patched"
      ? SNAPSHOT_COMPAT_PATHS
      : PATCH_PATHS;
  // Compute and authenticate every complete postimage before any write.
  const work = workPaths.map((relative) => {
    const file = inspected.files.get(relative);
    let baseBytes;
    if (inspected.state === "legacy-patched") {
      baseBytes = file.bytes;
    } else if (inspected.state === "prior-patched") {
      baseBytes = file.v1Bytes;
    }
    return {
      relative,
      ...file,
      replacement:
        baseBytes !== undefined
          ? applySnapshotCompatibility(relative, baseBytes)
          : convertPinnedSource(relative, file.bytes),
    };
  });
  const token = process.pid + "-" + crypto.randomBytes(8).toString("hex");
  const staged = [];
  const changed = [];
  let rollbackMessage = "";
  try {
    // Stage all outputs first, in the same directories for atomic renames.
    for (let i = 0; i < work.length; i++) {
      const entry = work[i];
      const temporary = tempPathFor(entry, token, i);
      checkedPath(root, path.relative(root, temporary));
      io.writeFileSync(temporary, entry.replacement, {
        flag: "wx",
        mode: entry.mode,
      });
      staged.push(temporary);
      if (
        !isExpectedFinalPostimage(entry.relative, io.readFileSync(temporary))
      ) {
        fail("Staged postimage changed unexpectedly: " + entry.relative);
      }
    }

    for (let i = 0; i < work.length; i++) {
      const entry = work[i];
      // Never overwrite an unexpected concurrent filesystem mutation.
      const onDisk = sha256(io.readFileSync(entry.path));
      const expectedBefore =
        inspected.state === "legacy-patched"
          ? PATCHED_SHA256[entry.relative]
          : inspected.state === "prior-patched"
            ? sha256(entry.bytes)
            : PINNED_SHA256[entry.relative];
      if (onDisk !== expectedBefore) {
        fail("Concurrent SDK content change: " + entry.relative);
      }
      io.renameSync(staged[i], entry.path);
      changed.push(entry);
    }
    const verified = preflight(root, io);
    if (verified.state !== "already-patched") {
      fail("Completed SDK patch did not produce its full verified postimage");
    }
    return { status: "applied", files: workPaths.length };
  } catch (error) {
    const failures = [];
    for (const entry of [...changed].reverse()) {
      let rollbackStage;
      try {
        const currentHash = sha256(io.readFileSync(entry.path));
        if (currentHash === sha256(entry.bytes)) continue;
        if (
          !isExpectedFinalPostimage(entry.relative, io.readFileSync(entry.path))
        ) {
          throw new Error("Refusing rollback of an unexpected concurrent edit");
        }
        rollbackStage = tempPathFor(entry, token + "-rollback", 0);
        checkedPath(root, path.relative(root, rollbackStage));
        io.writeFileSync(rollbackStage, entry.bytes, {
          flag: "wx",
          mode: entry.mode,
        });
        staged.push(rollbackStage);
        io.renameSync(rollbackStage, entry.path);
      } catch (rollbackError) {
        failures.push(entry.relative + ": " + rollbackError.message);
      }
    }
    if (failures.length) {
      rollbackMessage = " (ROLLBACK INCOMPLETE: " + failures.join("; ") + ")";
    }
    fail("Patch not applied: " + error.message + rollbackMessage);
  } finally {
    unlinkStaged(staged, io);
  }
}

module.exports = Object.freeze({
  patchWatermelonSyncHooks,
  DEFAULT_PACKAGE_DIRECTORY,
  MONYVI_SYNC_WRITER_GUARDS,
  PINNED_SHA256,
  PATCHED_SHA256,
  PATCH_OPERATIONS,
  PATCH_PATHS,
  SNAPSHOT_COMPAT_OPERATIONS,
  SNAPSHOT_COMPAT_PATHS,
  isSnapshotCompatiblePostimage,
  PRIOR_SNAPSHOT_COMPAT_OPERATIONS,
  isPriorSnapshotCompatiblePostimage,
});
