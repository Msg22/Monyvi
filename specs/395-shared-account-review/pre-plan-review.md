# Pre-plan review — #395

Date: 2026-10-14. Scope: specification approval and visual handoff only.

## Completed

- Spec owner approval recorded against unchanged published bytes:
  sha256:e012f5a7d2edadc8bc1e2fa2ce03aeea56bc0c947dc02bfc2a3f166150e2c7d0.
- Clarification/checklist complete; no unanswered product question identified.
- Base verified against origin/main 7838df64eb9b3828c6e8f1a02f590b008d5435fd.
- Superseded reference cleanup complete; eight retained scopes and fifteen R3
  frames remain unchanged.
- Existing CurrencyPicker reuse/context and Add Default flag documented.
- Twenty-three scoped sidecars prepared with valid image/metadata/combined
  fingerprints.
- Proposed normal/responsive/theme/RTL/type/accessibility/transition values
  collected in one contract. No further images.

## Concrete final review package

Package B1 manifest:
sha256:cf447362f73c91f975f97ecf2295bce1ed8300213f701f6caab181ee997059a0.

Read [common binding contract](mockups/binding-contract.md),
[R3 visuals](mockups/proposals/r3/preview.md),
[EN/AR copy and states](mockups/proposals/r3/interaction-notes.md), and the
scoped image/sidecar pairs below. Existing R1/R2 concept approvals are
preserved, not requested again; new exact metadata and R3 additions require
approval. R3-04 custom picker chrome remains excluded. All bindings remain
PENDING until explicit approval; a verifier success is not claimed.

| Image                                                                                              | Scoped binding                                                             | Combined revision                                                       |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [03-multiple-matches-en.png](mockups/references/r1/03-multiple-matches-en.png)                     | [facts](mockups/references/r1/03-multiple-matches-en.binding.md)           | sha256:c33986e7f608ca8411c07295653d5d92bb1247c40eca489125d87ea3be089100 |
| [07-edit-shared-draft-en.png](mockups/references/r1/07-edit-shared-draft-en.png)                   | [facts](mockups/references/r1/07-edit-shared-draft-en.binding.md)          | sha256:f3ee3a278bb4394787c0596c059e98903e99adcaf119c000ca84fa6267340aeb |
| [08-account-helper-en.png](mockups/references/r1/08-account-helper-en.png)                         | [facts](mockups/references/r1/08-account-helper-en.binding.md)             | sha256:b28eca632bdfb5dd0813d57bcd98a70e5fbda0c56565b801784db147412d31ce |
| [11-currency-confirm-en.png](mockups/references/r1/11-currency-confirm-en.png)                     | [facts](mockups/references/r1/11-currency-confirm-en.binding.md)           | sha256:1f0d89880a048802dbc6194ca767f5b72c0369941af2d6b7cd108a4c5f21a60f |
| [12-multiple-matches-ar.png](mockups/references/r1/12-multiple-matches-ar.png)                     | [facts](mockups/references/r1/12-multiple-matches-ar.binding.md)           | sha256:ae414959cbcd23d1d02fc0c980a4b4f645fea23ed847859bc7c1da4e815ccb4e |
| [01-unified-review-en.png](mockups/references/r2/01-unified-review-en.png)                         | [facts](mockups/references/r2/01-unified-review-en.binding.md)             | sha256:2170f443d73806360a4bb79ad1f838aa43fc959256dfa44f910b72cee01abd62 |
| [02-individual-account-actions-en.png](mockups/references/r2/02-individual-account-actions-en.png) | [facts](mockups/references/r2/02-individual-account-actions-en.binding.md) | sha256:c7eced836fb9a9b987afb49dbf2a4d1ae85766e339424b3f08708c2b5e5f9925 |
| [03-all-suggested-accounts-en.png](mockups/references/r2/03-all-suggested-accounts-en.png)         | [facts](mockups/references/r2/03-all-suggested-accounts-en.binding.md)     | sha256:07194c422eeb175ab105f724d5e881460305997bf4ff1cfea155930545360c94 |
| [01-add-account-default-en.png](mockups/proposals/r3/01-add-account-default-en.png)                | [facts](mockups/proposals/r3/01-add-account-default-en.binding.md)         | sha256:a2726dfe337198d0e72ddee4defcf3cde05f62cc2ad256945b74297cbe1dbef0 |
| [02-add-first-cash-default-en.png](mockups/proposals/r3/02-add-first-cash-default-en.png)          | [facts](mockups/proposals/r3/02-add-first-cash-default-en.binding.md)      | sha256:7f16d7666b4f5a3801d4e0c6930d820d970166eb6647970e59aa49d695b12084 |
| [03-confirm-currency-other-en.png](mockups/proposals/r3/03-confirm-currency-other-en.png)          | [facts](mockups/proposals/r3/03-confirm-currency-other-en.binding.md)      | sha256:93c86522d972ce038067bc253e35715629c1362cfb40ac56321ca415d452d342 |
| [04-other-currency-picker-en.png](mockups/proposals/r3/04-other-currency-picker-en.png)            | [facts](mockups/proposals/r3/04-other-currency-picker-en.binding.md)       | sha256:1a97ecf92acac1526471eeadb4c50647e3f60d42197f9bda2bfdfa803e9498ea |
| [05-combined-review-en.png](mockups/proposals/r3/05-combined-review-en.png)                        | [facts](mockups/proposals/r3/05-combined-review-en.binding.md)             | sha256:76355e32a5db32cfd47b12ad3c720489b28c9721de9aec70bbc651b9a7e5fcd7 |
| [06-removed-suggestion-undo-en.png](mockups/proposals/r3/06-removed-suggestion-undo-en.png)        | [facts](mockups/proposals/r3/06-removed-suggestion-undo-en.binding.md)     | sha256:121ac845cbf94cbb92f7040dacabd643215a035072560b138f923ae7ea830919 |
| [07-default-only-en.png](mockups/proposals/r3/07-default-only-en.png)                              | [facts](mockups/proposals/r3/07-default-only-en.binding.md)                | sha256:66ef741ac8676435ebabac4389fd4826f0ada4d42746eeae94be38120f0d0843 |
| [08-issues-only-en.png](mockups/proposals/r3/08-issues-only-en.png)                                | [facts](mockups/proposals/r3/08-issues-only-en.binding.md)                 | sha256:79e13fdc452b67143115df54439cd0380d2c43c04cde878e1914ccaf6c5236d3 |
| [09-confirmed-feedback-en.png](mockups/proposals/r3/09-confirmed-feedback-en.png)                  | [facts](mockups/proposals/r3/09-confirmed-feedback-en.binding.md)          | sha256:e3cde1b95b9aef817e7d193427476aad9ffdf9f130caae0df90dcab33a64da06 |
| [10-clean-review-en.png](mockups/proposals/r3/10-clean-review-en.png)                              | [facts](mockups/proposals/r3/10-clean-review-en.binding.md)                | sha256:fc68ed3c20743f3e19917210f0e9217247b070e762c9edd60e4df39489ff50aa |
| [11-empty-selected-filter-en.png](mockups/proposals/r3/11-empty-selected-filter-en.png)            | [facts](mockups/proposals/r3/11-empty-selected-filter-en.binding.md)       | sha256:db1daed31dd46701aa92bd47d437d4d97f1b845af02f3f39fa60fb9be72b8a23 |
| [12-default-why-en.png](mockups/proposals/r3/12-default-why-en.png)                                | [facts](mockups/proposals/r3/12-default-why-en.binding.md)                 | sha256:b191d57bdd27de2f2ace9ebafca8a1cf1b50c53f4ef895dcc0144b16be2421b4 |
| [13-group-replace-en.png](mockups/proposals/r3/13-group-replace-en.png)                            | [facts](mockups/proposals/r3/13-group-replace-en.binding.md)               | sha256:1188a1f932c8b0b4fc47a915574754fab0605facf9831bbbebc85f37152401aa |
| [14-sms-save-failure-en.png](mockups/proposals/r3/14-sms-save-failure-en.png)                      | [facts](mockups/proposals/r3/14-sms-save-failure-en.binding.md)            | sha256:96ce301f396ac3ed8f4bf28dd60b84a89e097ffd02c24d388d363cd464269ac1 |
| [15-combined-review-ar.png](mockups/proposals/r3/15-combined-review-ar.png)                        | [facts](mockups/proposals/r3/15-combined-review-ar.binding.md)             | sha256:3afa8d8df81bcd67db4c3f420e0b759ab892793493ba2280037ddde13fa3c2ec |

## What remains before plan

Approve B1 exact bindings and the existing R3 visual/copy additions. Then record
the receipt against this manifest and each combined revision, run the canonical
verifier, and close the visual gate. No technical contract research,
plan/tasks/analyze or worker assignment has started. Implementation still
follows completed plan/tasks/analyze.

Workflow authority: .agent/workflows/team-led-delivery.md lifecycle and
.agent/workflows/mockup-implementation.md section9.5. The latter states:
“Earlier image approval does not automatically approve later binding facts.”
