/**
 * Egyptian Financial Institution Registry
 *
 * Canonical catalog for Egyptian bank/wallet provider metadata and verified SMS
 * sender aliases. The mobile app derives provider dropdowns and sender presets
 * from this file, so new selectable providers should be added here first.
 */

export type EgyptianInstitutionType = "bank" | "wallet" | "payment";
export type EgyptianInstitutionAuditStatus =
  | "included"
  | "excluded"
  | "legacy-only"
  | "pending"
  | "renamed";

export interface EgyptianFinancialInstitution {
  readonly id: string;
  readonly type: EgyptianInstitutionType;
  readonly shortName: string;
  readonly fullName: string;
  readonly nameAr?: string;
  readonly senderPatterns: readonly string[];
  readonly selectable: boolean;
  readonly legacyIds?: readonly string[];
  readonly auditStatus: EgyptianInstitutionAuditStatus;
  readonly auditNote: string;
}

export type BankInfo = EgyptianFinancialInstitution;

export const EGYPTIAN_FINANCIAL_INSTITUTIONS = [
  {
    id: "adcb-egypt",
    type: "bank",
    shortName: "ADCB",
    fullName: "Abu Dhabi Commercial Bank Egypt",
    nameAr: "بنك أبوظبي التجاري مصر",
    senderPatterns: ["adcb", "adcbe", "adcbeegypt"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "adib-egypt",
    type: "bank",
    shortName: "ADIB",
    fullName: "Abu Dhabi Islamic Bank Egypt",
    nameAr: "مصرف أبوظبي الإسلامي مصر",
    senderPatterns: ["adib", "adibegypt"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "agricultural-bank-of-egypt",
    type: "bank",
    shortName: "ABE",
    fullName: "Agricultural Bank of Egypt",
    nameAr: "البنك الزراعي المصري",
    senderPatterns: ["agribank", "abe", "abegypt"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "abk-egypt",
    type: "bank",
    shortName: "ABK Egypt",
    fullName: "Al Ahli Bank of Kuwait - Egypt",
    nameAr: "البنك الأهلي الكويتي - مصر",
    senderPatterns: ["abk", "abkegypt"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "al-baraka-egypt",
    type: "bank",
    shortName: "Al Baraka",
    fullName: "Al Baraka Bank Egypt",
    nameAr: "بنك البركة مصر",
    senderPatterns: ["albaraka", "baraka"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "aaib",
    type: "bank",
    shortName: "AAIB",
    fullName: "Arab African International Bank",
    nameAr: "البنك العربي الأفريقي الدولي",
    senderPatterns: ["aaib"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "arab-bank",
    type: "bank",
    shortName: "Arab Bank",
    fullName: "Arab Bank PLC",
    nameAr: "البنك العربي",
    senderPatterns: ["arabbank", "arab-bank"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "arab-international-bank",
    type: "bank",
    shortName: "AIB",
    fullName: "Arab International Bank",
    nameAr: "المصرف العربي الدولي",
    senderPatterns: ["aib", "arabintl", "arabinternationalbank"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "attijariwafa-bank-egypt",
    type: "bank",
    shortName: "Attijariwafa",
    fullName: "Attijariwafa Bank Egypt",
    nameAr: "التجاري وفا بنك إيجيبت",
    senderPatterns: ["awb", "attijari", "attijariwafa"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "bank-abc",
    type: "bank",
    shortName: "Bank ABC",
    fullName: "Bank ABC Egypt",
    nameAr: "بنك ABC مصر",
    senderPatterns: ["bankabc", "abc", "blom"],
    selectable: true,
    legacyIds: ["blom-bank"],
    auditStatus: "included",
    auditNote: "BLOM is retained as legacy alias after Bank ABC integration.",
  },
  {
    id: "bank-nxt",
    type: "bank",
    shortName: "Bank NXT",
    fullName: "Bank NXT",
    nameAr: "بنك نكست",
    senderPatterns: ["banknxt", "nxt", "ainvest", "aibank"],
    selectable: true,
    legacyIds: ["arab-investment-bank", "aibank"],
    auditStatus: "renamed",
    auditNote: "Current identity replacing Arab Investment Bank/aiBANK.",
  },
  {
    id: "alexbank",
    type: "bank",
    shortName: "AlexBank",
    fullName: "Bank of Alexandria",
    nameAr: "بنك الإسكندرية",
    senderPatterns: ["alexbank", "alexalerts"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "banque-du-caire",
    type: "bank",
    shortName: "Banque du Caire",
    fullName: "Banque du Caire",
    nameAr: "بنك القاهرة",
    senderPatterns: ["banquecaire", "bdc"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "banque-misr",
    type: "bank",
    shortName: "Banque Misr",
    fullName: "Banque Misr",
    nameAr: "بنك مصر",
    senderPatterns: ["banquemisr", "bmisr", "bm"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "citibank-egypt",
    type: "bank",
    shortName: "Citi",
    fullName: "Citi Bank Egypt",
    nameAr: "سيتي بنك مصر",
    senderPatterns: ["citi", "citibank", "citibankegypt"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "cib",
    type: "bank",
    shortName: "CIB",
    fullName: "Commercial International Bank",
    nameAr: "البنك التجاري الدولي",
    senderPatterns: ["cib", "cibank", "cibegypt"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "credit-agricole-egypt",
    type: "bank",
    shortName: "Credit Agricole",
    fullName: "Credit Agricole Egypt",
    nameAr: "كريدي أجريكول مصر",
    senderPatterns: ["caegypt", "ca-egypt", "creditagri", "creditagricole"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "egyptian-arab-land-bank",
    type: "bank",
    shortName: "EALB",
    fullName: "Egyptian Arab Land Bank",
    nameAr: "البنك العقاري المصري العربي",
    senderPatterns: ["ealb"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "eg-bank",
    type: "bank",
    shortName: "EG Bank",
    fullName: "Egyptian Gulf Bank",
    nameAr: "البنك المصري الخليجي",
    senderPatterns: ["egbank", "egb"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "emirates-nbd-egypt",
    type: "bank",
    shortName: "Emirates NBD",
    fullName: "Emirates NBD Egypt",
    nameAr: "بنك الإمارات دبي الوطني مصر",
    senderPatterns: ["emiratesnbd", "enbd"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "edb-egypt",
    type: "bank",
    shortName: "EDB",
    fullName: "Export Development Bank of Egypt",
    nameAr: "البنك المصري لتنمية الصادرات",
    senderPatterns: ["edbbank", "edb"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "faisal-islamic-bank-egypt",
    type: "bank",
    shortName: "Faisal Bank",
    fullName: "Faisal Islamic Bank of Egypt",
    nameAr: "بنك فيصل الإسلامي المصري",
    senderPatterns: ["faisal", "faisalbank"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "fab-misr",
    type: "bank",
    shortName: "FAB Misr",
    fullName: "First Abu Dhabi Bank Misr",
    nameAr: "بنك أبوظبي الأول مصر",
    senderPatterns: ["fabmisr", "fab"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "hdb-egypt",
    type: "bank",
    shortName: "HDB",
    fullName: "Housing and Development Bank",
    nameAr: "بنك التعمير والإسكان",
    senderPatterns: ["hdbank", "hdb"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "hsbc-egypt",
    type: "bank",
    shortName: "HSBC",
    fullName: "HSBC Bank Egypt",
    nameAr: "بنك إتش إس بي سي مصر",
    senderPatterns: ["hsbc", "hsbcegypt"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "industrial-development-bank",
    type: "bank",
    shortName: "IDB",
    fullName: "Industrial Development Bank",
    nameAr: "بنك التنمية الصناعية",
    senderPatterns: ["idbegypt", "idb"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "kfh-egypt",
    type: "bank",
    shortName: "KFH Egypt",
    fullName: "KFH Egypt",
    nameAr: "بيت التمويل الكويتي مصر",
    senderPatterns: ["kfh", "kfhegypt", "aub", "ahliunited"],
    selectable: true,
    legacyIds: ["aub", "ahli-united-bank-egypt"],
    auditStatus: "renamed",
    auditNote: "Current identity replacing Ahli United Bank Egypt.",
  },
  {
    id: "mashreq-egypt",
    type: "bank",
    shortName: "Mashreq",
    fullName: "Mashreq Bank",
    nameAr: "بنك المشرق",
    senderPatterns: ["mashreq", "mashreqbank", "mashreq-egy"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "midbank",
    type: "bank",
    shortName: "MIDBank",
    fullName: "MIDBank",
    nameAr: "ميد بنك",
    senderPatterns: ["midbank"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "nasser-social-bank",
    type: "bank",
    shortName: "Nasser Social Bank",
    fullName: "Nasser Social Bank",
    nameAr: "بنك ناصر الاجتماعي",
    senderPatterns: ["nassersocialbank", "nasserbank", "nsb"],
    selectable: true,
    auditStatus: "included",
    auditNote:
      "Added from reviewed Egyptian provider list; Central Bank of Egypt, InstaPay, and National Bank of Greece remain excluded.",
  },
  {
    id: "nbe",
    type: "bank",
    shortName: "NBE",
    fullName: "National Bank of Egypt",
    nameAr: "البنك الأهلي المصري",
    senderPatterns: ["nbe", "nbegypt", "nbebank", "nbemobile"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "nbk-egypt",
    type: "bank",
    shortName: "NBK Egypt",
    fullName: "National Bank of Kuwait - Egypt",
    nameAr: "بنك الكويت الوطني - مصر",
    senderPatterns: ["nbk", "nbkegypt"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "qnb-egypt",
    type: "bank",
    shortName: "QNB",
    fullName: "QNB Egypt",
    nameAr: "بنك QNB مصر",
    senderPatterns: ["qnb", "qnbegypt", "qnbalahli"],
    selectable: true,
    legacyIds: ["qnb-al-ahli"],
    auditStatus: "renamed",
    auditNote: "Current display name is QNB Egypt; QNB Al Ahli kept as alias.",
  },
  {
    id: "saib",
    type: "bank",
    shortName: "SAIB",
    fullName: "SAIB",
    nameAr: "بنك الشركة المصرفية العربية الدولية",
    senderPatterns: ["saib"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "standard-chartered",
    type: "bank",
    shortName: "Standard Chartered",
    fullName: "Standard Chartered Bank",
    nameAr: "ستاندرد تشارترد بنك",
    senderPatterns: ["standardchartered", "sc-egypt", "scb-egypt"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Added from registry audit; missing from the previous file.",
  },
  {
    id: "suez-canal-bank",
    type: "bank",
    shortName: "SC Bank",
    fullName: "Suez Canal Bank",
    nameAr: "بنك قناة السويس",
    senderPatterns: ["scbank", "suezcanalbank"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "the-united-bank",
    type: "bank",
    shortName: "United Bank",
    fullName: "The United Bank",
    nameAr: "المصرف المتحد",
    senderPatterns: ["unitedbank", "ub"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active bank in Egypt audit list.",
  },
  {
    id: "vodafone-cash",
    type: "wallet",
    shortName: "Vodafone Cash",
    fullName: "Vodafone Cash",
    nameAr: "فودافون كاش",
    senderPatterns: ["vf-cash", "vfcash", "vodafonecash"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active telecom wallet in NTRA audit.",
  },
  {
    id: "e-and-cash",
    type: "wallet",
    shortName: "e& money",
    fullName: "e& money",
    nameAr: "إي آند موني",
    senderPatterns: [
      "e&money",
      "eandmoney",
      "e&cash",
      "eandcash",
      "etisalatcash",
      "etisalat-cash",
    ],
    selectable: true,
    legacyIds: ["etisalat-cash"],
    auditStatus: "renamed",
    auditNote:
      "Product-confirmed display uses current e& money branding; e& Cash and Etisalat Cash remain sender/legacy aliases.",
  },
  {
    id: "orange-cash",
    type: "wallet",
    shortName: "Orange Cash",
    fullName: "Orange Cash",
    nameAr: "أورنج كاش",
    senderPatterns: ["orangecash", "orange-cash"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active telecom wallet in NTRA audit.",
  },
  {
    id: "we-pay",
    type: "wallet",
    shortName: "WE Pay",
    fullName: "WE Pay",
    nameAr: "وي باي",
    senderPatterns: ["wepay", "we-pay"],
    selectable: true,
    auditStatus: "included",
    auditNote: "Active telecom wallet in NTRA audit.",
  },
  {
    id: "nbe-phone-cash",
    type: "wallet",
    shortName: "NBE Phone Cash",
    fullName: "NBE Phone Cash",
    senderPatterns: [],
    selectable: false,
    auditStatus: "pending",
    auditNote:
      "Meeza-listed bank wallet; needs current availability verification before dropdown inclusion.",
  },
  {
    id: "bm-wallet",
    type: "wallet",
    shortName: "BM Wallet",
    fullName: "Banque Misr Wallet",
    senderPatterns: [],
    selectable: false,
    auditStatus: "pending",
    auditNote:
      "Meeza-listed bank wallet; needs current availability verification before dropdown inclusion.",
  },
  {
    id: "qahera-cash",
    type: "wallet",
    shortName: "Qahera Cash",
    fullName: "Qahera Cash",
    senderPatterns: [],
    selectable: false,
    auditStatus: "pending",
    auditNote:
      "Meeza-listed bank wallet; needs current availability verification before dropdown inclusion.",
  },
  {
    id: "qnb-wallet",
    type: "wallet",
    shortName: "QNB Wallet",
    fullName: "QNB E-Wallet",
    senderPatterns: [],
    selectable: false,
    auditStatus: "pending",
    auditNote:
      "Meeza-listed bank wallet; needs current availability verification before dropdown inclusion.",
  },
  {
    id: "credit-agricole-banki-wallet",
    type: "wallet",
    shortName: "banki Wallet",
    fullName: "Credit Agricole banki Wallet",
    senderPatterns: [],
    selectable: false,
    auditStatus: "pending",
    auditNote:
      "Meeza-listed bank wallet; needs current availability verification before dropdown inclusion.",
  },
  {
    id: "nbk-mobile-wallet",
    type: "wallet",
    shortName: "NBK Wallet",
    fullName: "NBK Mobile Wallet",
    senderPatterns: [],
    selectable: false,
    auditStatus: "pending",
    auditNote:
      "Meeza-listed bank wallet; needs current availability verification before dropdown inclusion.",
  },
  {
    id: "aipay",
    type: "wallet",
    shortName: "aiPAY",
    fullName: "Bank NXT aiPAY",
    senderPatterns: [],
    selectable: false,
    auditStatus: "pending",
    auditNote:
      "Meeza-listed bank wallet; needs current availability verification before dropdown inclusion.",
  },
  {
    id: "myfawry-yellowcard",
    type: "wallet",
    shortName: "myFawry Yellowcard",
    fullName: "myFawry Yellowcard",
    senderPatterns: [],
    selectable: false,
    auditStatus: "pending",
    auditNote:
      "Needs confirmed balance-holding account behavior before dropdown inclusion.",
  },
  {
    id: "fawry",
    type: "payment",
    shortName: "Fawry",
    fullName: "Fawry",
    senderPatterns: [],
    selectable: false,
    auditStatus: "excluded",
    auditNote:
      "Generic payment network is not a wallet account provider for this feature.",
  },
  {
    id: "onebank",
    type: "bank",
    shortName: "onebank",
    fullName: "onebank",
    senderPatterns: [],
    selectable: false,
    auditStatus: "pending",
    auditNote: "Pending public consumer account availability verification.",
  },
] as const satisfies readonly EgyptianFinancialInstitution[];

export type EgyptianInstitutionId =
  (typeof EGYPTIAN_FINANCIAL_INSTITUTIONS)[number]["id"];
export type SelectableEgyptianInstitution = Extract<
  (typeof EGYPTIAN_FINANCIAL_INSTITUTIONS)[number],
  { readonly selectable: true }
>;
export type SelectableEgyptianInstitutionId =
  SelectableEgyptianInstitution["id"];

const INSTITUTION_BY_ID = new Map<string, EgyptianFinancialInstitution>(
  EGYPTIAN_FINANCIAL_INSTITUTIONS.map((institution) => [
    institution.id,
    institution,
  ])
);

const SENDER_LOOKUP_MAP: ReadonlyMap<string, EgyptianFinancialInstitution> =
  buildLookupMap();
const MIN_SUBSTRING_PATTERN_LENGTH = 4;
const MIN_BOUNDARY_PATTERN_LENGTH = 3;
const SENDER_BOUNDARY_PATTERN = "[^a-z0-9]";

function buildLookupMap(): Map<string, EgyptianFinancialInstitution> {
  const map = new Map<string, EgyptianFinancialInstitution>();

  for (const institution of EGYPTIAN_FINANCIAL_INSTITUTIONS) {
    for (const pattern of institution.senderPatterns) {
      map.set(normalizeSenderPattern(pattern), institution);
    }
  }

  return map;
}

function normalizeSenderPattern(senderAddress: string): string {
  return senderAddress.trim().toLowerCase();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasSenderBoundaryMatch(
  normalizedSender: string,
  normalizedPattern: string
): boolean {
  const boundaryRegex = new RegExp(
    `(^|${SENDER_BOUNDARY_PATTERN})${escapeRegex(normalizedPattern)}($|${SENDER_BOUNDARY_PATTERN})`
  );

  return boundaryRegex.test(normalizedSender);
}

export function isKnownFinancialSender(
  senderAddress: string
): EgyptianFinancialInstitution | undefined {
  const normalized = normalizeSenderPattern(senderAddress);
  if (!normalized) {
    return undefined;
  }

  const exactMatch = SENDER_LOOKUP_MAP.get(normalized);
  if (exactMatch) {
    return exactMatch;
  }

  for (const [pattern, institution] of SENDER_LOOKUP_MAP) {
    if (
      (pattern.length >= MIN_SUBSTRING_PATTERN_LENGTH &&
        normalized.includes(pattern)) ||
      (pattern.length >= MIN_BOUNDARY_PATTERN_LENGTH &&
        hasSenderBoundaryMatch(normalized, pattern))
    ) {
      return institution;
    }
  }

  return undefined;
}

export function getAllFinancialSenders(): ReadonlyMap<
  string,
  EgyptianFinancialInstitution
> {
  return SENDER_LOOKUP_MAP;
}

export function getSelectableEgyptianInstitutions(
  type: "bank" | "wallet"
): readonly SelectableEgyptianInstitution[] {
  return EGYPTIAN_FINANCIAL_INSTITUTIONS.filter(
    (institution): institution is SelectableEgyptianInstitution =>
      institution.type === type && institution.selectable
  );
}

export function getInstitutionById(
  id: string
): EgyptianFinancialInstitution | undefined {
  return INSTITUTION_BY_ID.get(id);
}

export function getSenderPatternsForInstitution(id: string): readonly string[] {
  return getInstitutionById(id)?.senderPatterns ?? [];
}
