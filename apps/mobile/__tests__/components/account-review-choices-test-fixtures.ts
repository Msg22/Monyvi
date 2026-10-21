/**
 * #395 T035 presentation-only EN/AR chooser fixtures.
 *
 * The catalog has TWO QNB/EGP accounts. R1-03's third option below is a
 * synthetic UI candidate, NOT an owned T015 role or a seeded bank record.
 * There are no DB/service/parser/reducer/Save calls or persisted DTOs here.
 */
import manifest from "../../e2e/fixtures/shared-account-review.json";
import type {
  AccountChoiceCandidateView,
  AccountChoiceSheetProps,
} from "@/components/transaction-review/AccountChoiceSheet";

export type ChoiceCandidate = AccountChoiceCandidateView;
export type AccountChoiceViewProps = AccountChoiceSheetProps;

export interface CurrencyCandidate {
  readonly code: string;
  readonly label: string;
  readonly accessibilityLabel: string;
}

export interface CurrencyConflictViewProps {
  readonly visible: boolean;
  readonly contextSubtitle: string;
  readonly candidateOptions: readonly CurrencyCandidate[];
  readonly selectedCandidateCode: string | null;
  readonly canUseSelection: boolean;
  readonly isBusy: boolean;
  readonly onSelectCandidate: (code: string) => void;
  readonly onUseSelected: () => void;
  readonly onChooseAnother: () => void;
  readonly onClose: () => void;
}

export const ROW_CONTEXT_EN = "For Lunch at Talabat";
export const ROW_CONTEXT_AR = "للغداء من طلبات";
export const GROUP_SCOPE_EN = "Replace QNB for all 3 linked transactions.";

const currencyOptions: readonly CurrencyCandidate[] = [
  {
    code: "EGP",
    label: "Egyptian Pound",
    accessibilityLabel: "Egyptian Pound, EGP",
  },
  { code: "USD", label: "US Dollar", accessibilityLabel: "US Dollar, USD" },
];

export function makeQnbChoiceCandidates(): readonly ChoiceCandidate[] {
  const actualDescriptorOptions = manifest.accountContext.accounts.filter(
    (account) =>
      account.institutionId === "qnb" &&
      account.currency === "EGP" &&
      account.type === "BANK" &&
      account.cardLast4 !== null
  );
  if (actualDescriptorOptions.length !== 2) {
    throw new Error(
      "Expected precisely the two frozen QNB/EGP descriptor roles"
    );
  }
  const known = actualDescriptorOptions.map(
    (account): ChoiceCandidate => ({
      id: account.id,
      displayName: account.name,
      identityDetails: "Bank · QNB · •••• " + account.cardLast4,
      currencyCode: account.currency,
      accessibilityLabel:
        account.name + ", Bank, EGP, card ending " + account.cardLast4,
      isEligible: true,
    })
  );
  const extra: ChoiceCandidate = {
    id: "synthetic-ui-only-third-QNB-candidate",
    displayName: "QNB Everyday",
    identityDetails: "Bank · QNB · •••• 4402",
    currencyCode: "EGP",
    accessibilityLabel: "QNB Everyday, Bank, EGP, card ending 4402",
    isEligible: true,
  };
  return [...known, extra];
}

export function makeAccountChoiceProps(
  overrides: Partial<AccountChoiceViewProps> = {}
): AccountChoiceViewProps {
  return {
    visible: true,
    title: "Choose an account",
    contextSubtitle: ROW_CONTEXT_EN,
    scopeDisclosure: "Only this transaction will change.",
    candidateOptions: makeQnbChoiceCandidates(),
    selectedCandidateId: null,
    canUseSelection: false,
    isBusy: false,
    onSelectCandidate: jest.fn(),
    onUseSelected: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
}

export function makeGroupChoiceProps(
  overrides: Partial<AccountChoiceViewProps> = {}
): AccountChoiceViewProps {
  return makeAccountChoiceProps({
    contextSubtitle: undefined,
    scopeDisclosure: GROUP_SCOPE_EN,
    ...overrides,
  });
}

export function makeCurrencyConflictProps(
  overrides: Partial<CurrencyConflictViewProps> = {}
): CurrencyConflictViewProps {
  return {
    visible: true,
    contextSubtitle: ROW_CONTEXT_EN,
    candidateOptions: currencyOptions,
    selectedCandidateCode: null,
    canUseSelection: false,
    isBusy: false,
    onSelectCandidate: jest.fn(),
    onUseSelected: jest.fn(),
    onChooseAnother: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
}

export function getQnbCandidate(
  candidates: readonly ChoiceCandidate[],
  suffix: "0007" | "9221" | "4402"
): ChoiceCandidate {
  const match = candidates.find((entry) =>
    entry.accessibilityLabel.endsWith("card ending " + suffix)
  );
  if (match === undefined)
    throw new Error("Expected distinct QNB candidate " + suffix);
  return match;
}

export function countEligibleCandidates(
  candidates: readonly ChoiceCandidate[]
): number {
  return candidates.filter((candidate) => candidate.isEligible).length;
}

/** Existing B1 chooser with only one user-created draft type permitted. */
export function makeManualDraftChoiceProps(
  type: "BANK" | "CASH",
  onSubmit: NonNullable<AccountChoiceSheetProps["draftCreation"]>["onSubmit"],
  overrides: Partial<AccountChoiceViewProps> = {}
): AccountChoiceViewProps {
  return makeAccountChoiceProps({
    candidateOptions: [],
    isCashDestination: type === "CASH",
    draftCreation: {
      lockedCurrencyLabel: "EGP",
      typeOptions: [
        {
          id: type,
          label: type === "CASH" ? "Cash" : "Bank",
        },
      ],
      onSubmit,
    },
    ...overrides,
  });
}

/** No phantom selected account; human explicitly confirms the owned USD row. */
export function makeExplicitCurrencyConsentChoiceProps(
  onUseSelected: () => void
): AccountChoiceViewProps {
  const selected = getQnbCandidate(makeQnbChoiceCandidates(), "0007");
  return makeAccountChoiceProps({
    candidateOptions: [{ ...selected, currencyCode: "USD" }],
    selectedCandidateId: selected.id,
    canUseSelection: true,
    explicitCurrencyChoice: { previousConfirmedCurrency: null },
    onUseSelected,
  });
}
