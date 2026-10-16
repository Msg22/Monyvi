import { field } from "@nozbe/watermelondb/decorators";
import { BaseFinancialActionGroup } from "./base/base-financial-action-group";

export class FinancialActionGroup extends BaseFinancialActionGroup {
  /** Device-only recovery evidence; never part of synced action payloads. */
  @field("local_recovery_snapshot_json")
  localRecoverySnapshotJson!: string | null;
}
