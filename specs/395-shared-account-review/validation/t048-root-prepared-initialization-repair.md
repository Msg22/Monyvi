# T048 root prepared-initialization repair — source candidate

**Date:** 2026-10-16  
**Repository:** `Msg22/Monyvi`  
**Exact immutable parent:** `134a332e1aa0a749f91f1b3d76d1d18a03d1f601`  
**Parent tree:** `259cc56978511e5894daf33a3423b0209857b417`  
**Scope:** `apps/mobile/services/financial-action-foundation-repository.ts` and this validation record only.

## Confirmed cause

At the frozen source, `prepareNewRoot(context, "local_complete", now)` constructs a `FinancialActionGroup` with WatermelonDB `collection().prepareCreate(callback)`; its create callback has already completed on return. `prepareLocalRoot` subsequently writes `record.localRecoverySnapshotJson = localSnapshotJson` outside that callback for a newly created root. The decorated setter refuses mutation of an already-prepared model outside `prepareCreate` or `prepareUpdate`, producing the reported `Not allowed to change record financial_action_groups outside create/update` diagnostic during genuine Review Save/capture. This is a source placement defect, not a migration or mock failure.

## Minimal corrective change

1. The private `prepareNewRoot` helper now accepts an optional, strictly typed `localSnapshotJson: string | null = null`.
2. When non-null, it writes `candidate.localRecoverySnapshotJson = localSnapshotJson` **inside the existing `prepareCreate` callback**, alongside the already initialized immutable root metadata and current action state. Null carries the legacy behavior and does not force a private field onto other actions.
3. The new-root arm of `prepareLocalRoot` passes `localSnapshotJson` into `prepareNewRoot`. The illegal out-of-callback decorated setter has been removed.
4. The `foundRecord` arm still performs its state/timestamp/private-field mutation **inside its original `record.prepareUpdate(callback)`** without another root creation or an extra persistence phase.

The existing three-argument `prepareNewRoot(context, "pending_local", new Date())` call stays intact and defaults to null. No new DTO, public schema, financial-action payload, hash, state transition, generated model or migration is introduced.

## Preserved sequencing and privacy

The surrounding `commitLinkedPlan` code is deliberately unchanged. It still validates prepared linked ownership and postimages, then awaits the existing typed local snapshot builder using actual cached/prepared evidence. It reasserts authenticated owner, immutable pending root, and linked prepared identities after those awaits; only then does it prepare the `local_complete` root and commit `[root.operation, ...linkedOperations]` through the **one original atomic batch**. Existing actor checks, rollback, replay, approved tuple recognition and pending-root safety remain source-identical.

The nine-key recovery payload stays in the device-only `localRecoverySnapshotJson` field, never the public envelope, payload hash, server outcome, RPC or logs. No direct `_raw` assignment, `_isEditing` manipulation, decorator bypass or post-commit write is used.

## Evidence and limits

The exact source was read from the immutable parent, and only this two-file GitData candidate was authored. Root separately reported meaningful existing Review Save/T043 physical Red with the stated Watermelon diagnostic; **this worker did not rerun or reproduce tests**. No existing tests were changed or added, consistent with the narrow grant.

**NOT RUN:** Jest, TypeScript, ESLint, formatter, SQLite adapter, migration, SQL/pgTAP, native/emulator, hosted/provider, integration or acceptance checks. Source correctness after the placement repair remains pending Root's consolidated checks and independent review. The other T049 queue-verifier/prune, T054 filter, AddCore, Storage pull and Panel SQL tasks were not modified.

**Release:** unreferenced GitData commit only. No branch/ref/push/PR metadata mutation. **SOURCE RELEASED — STOP.**
