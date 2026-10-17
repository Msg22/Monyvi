/**
 * #395: opt-in LOCAL-ONLY roles for T015 current-owner synthetic Voice scenes.
 * Not a hosted seed, not an SMS review queue, and never a Save shortcut.
 * Static descriptors are alias-only: runtime IDs are derived from the user.
 */
function createAccountReviewE2eFixture(E2E_SEED_FIXTURE) {
  return {
    ...E2E_SEED_FIXTURE,
    seedScope: "e2e-account-review",
    requiresLocalSupabase: true,
    accountNames: {
      cash: "Cash",
      bank: "CIB Main",
      qnbBank: "QNB Everyday",
      wallet: "Wallet",
    },
    // Only approved, nonidentity role columns may override the four established
    // seed accounts. seed-engine refuses arbitrary or cross-owner overrides.
    baseAccountOverrides: {
      bank: { institution_id: "cib", provider_display_name: "CIB" },
      qnbBank: { institution_id: "qnb", provider_display_name: "QNB" },
      wallet: {
        currency: "USD",
        institution_id: null,
        provider_display_name: "Mobile Wallet",
      },
    },
    baseBankDetailOverrides: {
      nbe: { card_last_4: 5566, account_number: "00005566" },
      qnb: { card_last_4: 7, account_number: "00000007" },
    },
    baseSmsSenderOverrides: {
      nbe: { sender_name: "CIB", normalized_sender_name: "cib" },
      wallet: { sender_name: "WALLET", normalized_sender_name: "wallet" },
    },
    buildExtraRows({
      deterministicUuid,
      seedScope,
      userId,
      currentTimestamp,
      fixedNow,
    }) {
      const savingsId = deterministicUuid(
        seedScope,
        userId,
        "account-review:qnb-savings"
      );
      const thirdQnbId = deterministicUuid(
        seedScope,
        userId,
        "account-review:qnb-everyday-4402"
      );
      const bank = (id, name) => ({
        id,
        user_id: userId,
        name,
        type: "BANK",
        balance: 0,
        currency: "EGP",
        institution_id: "qnb",
        provider_display_name: "QNB",
        is_default: false,
        deleted: false,
        created_at: fixedNow,
        updated_at: currentTimestamp,
      });
      const detail = (id, accountId, card) => ({
        id,
        account_id: accountId,
        card_last_4: card,
        account_number: null,
        deleted: false,
        created_at: fixedNow,
        updated_at: fixedNow,
      });
      const sender = (id, accountId) => ({
        id,
        account_id: accountId,
        sender_name: "QNB",
        normalized_sender_name: "qnb",
        deleted: false,
        created_at: fixedNow,
        updated_at: fixedNow,
      });
      return {
        accounts: [
          bank(savingsId, "QNB Savings"),
          // Active known-provider uniqueness uses account identity, not card
          // suffix. Retain the owner-derived thirdQnbId and numeric card 4402.
          bank(thirdQnbId, "QNB Premier"),
        ],
        bankDetails: [
          detail(
            deterministicUuid(
              seedScope,
              userId,
              "account-review:bank-detail-qnb-savings"
            ),
            savingsId,
            9221
          ),
          detail(
            deterministicUuid(
              seedScope,
              userId,
              "account-review:bank-detail-qnb-4402"
            ),
            thirdQnbId,
            4402
          ),
        ],
        accountSmsSenders: [
          sender(
            deterministicUuid(
              seedScope,
              userId,
              "account-review:sender-qnb-savings"
            ),
            savingsId
          ),
          sender(
            deterministicUuid(
              seedScope,
              userId,
              "account-review:sender-qnb-4402"
            ),
            thirdQnbId
          ),
        ],
      };
    },
  };
}

module.exports = { createAccountReviewE2eFixture };
