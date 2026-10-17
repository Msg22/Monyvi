/**
 * #395 T026 B1 presentation-only shapes; not a domain/session schema.
 * R2-03 six-group case is synthetic and NOT a 16th runtime descriptor.
 * No account/DB/provider/command/Save calls.
 */
import type { ReviewableTransaction } from "@monyvi/logic";
import manifest from "../../e2e/fixtures/shared-account-review.json";

type Scenario = (typeof manifest.scenes)[number];
type ScenarioGroup = Scenario["groups"][number];

export interface SharedGroupViewFixture {
  readonly groupId: string;
  readonly displayName: string;
  readonly identitySummary: string;
  readonly currencyLabel: string;
  readonly typeIconName: string;
  readonly linkedCount: number;
  readonly statusLabel: string;
  readonly disclosureText: string;
  readonly isConfirmed: boolean;
  readonly isRemoved: boolean;
  readonly isBusy: boolean;
  readonly canConfirm: boolean;
  readonly canEdit: boolean;
  readonly canReplace: boolean;
  readonly canRemove: boolean;
  readonly canUndo: boolean;
}
export interface SharedSummaryFixture {
  readonly totalCount: number;
  readonly distinctNeedsReviewCount: number;
  readonly pendingGroupCount: number;
  readonly confirmedGroupCount: number;
  readonly defaultAssignmentCount: number;
  readonly selectedCount: number;
  readonly issueLabels: readonly string[];
}
export interface SharedPresentationFixture {
  readonly groups: readonly SharedGroupViewFixture[];
  readonly summary: SharedSummaryFixture;
}

function requireScene(id: string): Scenario {
  const scene = manifest.scenes.find((entry) => entry.id === id);
  if (!scene) throw new Error("Unknown B1 scene " + id);
  return scene;
}
function issueLabel(tag: string): string {
  if (tag === "currency_confirmation_needed") return "Confirm currency";
  if (tag === "amount") return "Check amount";
  if (tag === "category") return "Choose a category";
  if (tag === "account_group_unconfirmed") return "Confirm account";
  return "Choose an account";
}
function groupDisclosure(
  name: string,
  count: number,
  locale: "en" | "ar"
): string {
  if (locale === "ar") {
    if (name === "QNB" && count === 3) {
      return "اختيار معاملة من QNB يؤكد الحساب للمعاملات الثلاث.";
    }
    if (count === 1)
      return "اختيار معاملة من " + name + " يؤكد الحساب لهذه المعاملة.";
    if (count === 2)
      return "اختيار معاملة من " + name + " يؤكد الحساب لمعاملتين.";
    return "اختيار معاملة من " + name + " يؤكد الحساب لـ" + count + " معاملات.";
  }
  if (count === 1) {
    return (
      "Selecting a " +
      name +
      " transaction confirms this account for 1 transaction."
    );
  }
  return (
    "Selecting a " +
    name +
    " transaction confirms this account for all " +
    count +
    "."
  );
}
function toGroupView(
  group: ScenarioGroup,
  locale: "en" | "ar"
): SharedGroupViewFixture {
  const isConfirmed = group.status === "confirmed";
  const isRemoved = group.status === "removed";
  const pending = !isConfirmed && !isRemoved;
  return {
    groupId: group.groupId,
    displayName: group.name,
    identitySummary:
      (group.type === "BANK" ? "Bank" : group.type) +
      " · " +
      group.currency +
      " · •••• " +
      (group.cardLast4 ?? "----"),
    currencyLabel: group.currency,
    typeIconName: group.type === "BANK" ? "business-outline" : "wallet-outline",
    linkedCount: group.linkedRowIds.length,
    statusLabel: isConfirmed ? "Confirmed" : isRemoved ? "Removed" : "Pending",
    disclosureText: groupDisclosure(
      group.name,
      group.linkedRowIds.length,
      locale
    ),
    isConfirmed,
    isRemoved,
    isBusy: false,
    canConfirm: pending,
    canEdit: !isRemoved,
    canReplace: !isRemoved,
    canRemove: !isRemoved,
    canUndo: isRemoved,
  };
}
function countIssues(scene: Scenario): number {
  return scene.rows.filter((row) => row.issueTags.length > 0).length;
}
export function makeSharedPresentation(
  id:
    | "r3-combined-en"
    | "r3-combined-ar"
    | "r3-removed-undo"
    | "r3-confirmed-feedback"
    | "r3-default-only"
    | "r3-clean"
    | "r3-currency-conflict",
  locale: "en" | "ar" = "en"
): SharedPresentationFixture {
  const scene = requireScene(id);
  const groups = scene.groups.map((group) => toGroupView(group, locale));
  return {
    groups,
    summary: {
      totalCount: scene.rows.length,
      distinctNeedsReviewCount: countIssues(scene),
      pendingGroupCount: groups.filter(
        (group) => !group.isConfirmed && !group.isRemoved
      ).length,
      confirmedGroupCount: groups.filter((group) => group.isConfirmed).length,
      defaultAssignmentCount: scene.rows.filter(
        (row) => row.accountId === manifest.defaultAccountId
      ).length,
      selectedCount: scene.rows.filter((row) => row.selected).length,
      issueLabels: [
        ...new Set(scene.rows.flatMap((row) => row.issueTags.map(issueLabel))),
      ],
    },
  };
}
export function requireGroup(
  view: SharedPresentationFixture,
  name: string
): SharedGroupViewFixture {
  const group = view.groups.find((item) => item.displayName === name);
  if (!group) throw new Error("Missing B1 group " + name);
  return group;
}
export function withGroup(
  view: SharedPresentationFixture,
  groupId: string,
  changes: Partial<SharedGroupViewFixture>
): SharedPresentationFixture {
  if (!view.groups.some((group) => group.groupId === groupId)) {
    throw new Error("Attempt to change unknown test group");
  }
  return {
    ...view,
    groups: view.groups.map((group) =>
      group.groupId === groupId ? { ...group, ...changes } : group
    ),
  };
}
/** R2-03 approved six distinct groups, 12 rows (3 linked QNB, 7 other, 2 Cash). */
export function makeSixGroupViewAll(): SharedPresentationFixture {
  const qnb = requireGroup(
    makeSharedPresentation("r3-confirmed-feedback"),
    "QNB"
  );
  const base = requireGroup(makeSharedPresentation("r3-combined-en"), "CIB");
  const names = [
    "CIB",
    "Synthetic Bank 3",
    "Synthetic Bank 4",
    "Synthetic Wallet 5",
    "Synthetic Bank 6",
  ];
  const counts = [2, 2, 1, 1, 1];
  const pending = names.map(
    (name, index): SharedGroupViewFixture => ({
      ...base,
      groupId: "synthetic-r2-03-" + (index + 2),
      displayName: name,
      linkedCount: counts[index] ?? 1,
      disclosureText: groupDisclosure(name, counts[index] ?? 1, "en"),
    })
  );
  return {
    groups: [{ ...qnb, linkedCount: 3 }, ...pending],
    summary: {
      totalCount: 12,
      distinctNeedsReviewCount: 7,
      pendingGroupCount: 5,
      confirmedGroupCount: 1,
      defaultAssignmentCount: 2,
      selectedCount: 2,
      issueLabels: ["Confirm account"],
    },
  };
}
export function makeTestReviewTransaction(): ReviewableTransaction {
  return {
    amount: 120,
    currency: "EGP",
    type: "EXPENSE",
    counterparty: "Lunch",
    date: new Date("2026-10-15T12:00:00.000Z"),
    categoryId: "synthetic-ui-category",
    categoryDisplayName: "Food",
    confidence: 0.92,
    originLabel: "QNB",
    source: "VOICE",
  };
}
export const B1_TYPE_OPTIONS = [
  { id: "BANK", label: "Bank" },
  { id: "DIGITAL_WALLET", label: "Digital wallet" },
] as const;
