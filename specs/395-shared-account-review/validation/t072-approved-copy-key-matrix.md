# #395 T072 — Approved B1 review/default EN/AR copy key matrix

**Source:** B1 manifest `cf447362f73c91f975f97ecf2295bce1ed8300213f701f6caab181ee997059a0`, 2026-10-14 owner approval receipt, frozen R3 interaction/copy notes and original sidecars. No image/sidecar modification, translation rewrite of user account names, invented parsing terminology, or new product decision. Added only to current `accounts.json` and `transactions.json` resources.

## All 23 B1 approved scoped bindings inventoried

| Approval scope | Binding authority / affected keys |
| --- | --- |
| R1-03 multiple matches EN | `account_review_choice_*`, `account_review_issue_account` |
| R1-07 edit shared draft EN | `account_review_group_edit_*`, `account_review_group_name/type/locked_currency/linked` |
| R1-08 Edit account helper EN | `accounts.default_account_*` helper/switch; existing `default_account` |
| R1-11 currency confirmation EN | `account_review_currency_*`, `account_review_choice_*` |
| R1-12 multiple matches AR | Arabic `account_review_choice_*`, preserved RTL/user names |
| R2-01 unified review EN | `account_review_details_title`, group detail/status keys |
| R2-02 per-group actions EN | `account_review_group_confirm/edit/replace/remove/undo/change` |
| R2-03 all suggested accounts EN | `account_review_group_view_all/close/linked` |
| R3-01 Add Account default EN | `accounts.default_account_bank_helper`, replacement notice |
| R3-02 first Cash default EN | `accounts.default_account_cash_helper/cash_sms_restriction/first_helper` |
| R3-03 conflicting currency other EN | `account_review_currency_choose_another` |
| R3-04 existing currency picker EN | `account_review_currency_context_lunch`; reuse current CurrencyPicker copy |
| R3-05 combined review EN | group, issue, filter, default and selection keys |
| R3-06 removed/Undo EN | `account_review_removed_qnb`, `account_review_group_undo` |
| R3-07 default only EN | existing `account_review_default_note_*`, Why trigger |
| R3-08 issues only EN | four approved `account_review_issue_*` keys |
| R3-09 confirmed EN | group feedback, selected-only feedback, Confirmed |
| R3-10 clean EN | no new empty-detail copy, existing account labels |
| R3-11 selected filter empty EN | selected label/empty/help, existing `show_all` |
| R3-12 default Why EN | existing approved `account_review_default_why_*` and reminder |
| R3-13 group replacement EN | `account_review_group_replace_qnb3`, choice-preserve-selection |
| R3-14 SMS Save failure EN | `account_review_save_failed/try_save_again/review_later` |
| R3-15 combined Arabic | Arabic equivalents of R3-05 keys, QNB3 scope, RTL, plural handling |

## Accounts resource additions (6 new keys in each EN/AR)

| Key | English | Arabic | B1 contract |
| --- | --- | --- | --- |
| `default_account_bank_helper` | Used for new transactions and voice or SMS entries when no account is mentioned and the currency matches. | يُستخدم للمعاملات الجديدة ومعاملات الصوت والرسائل عندما لا يُذكر حساب وتطابق العملة عملة الحساب. | R1-08, R3-01 |
| `default_account_cash_helper` | Used for new transactions and voice entries when no account is mentioned and the currency matches. | يُستخدم للمعاملات الجديدة ومعاملات الصوت عندما لا يُذكر حساب وتطابق العملة عملة الحساب. | R3-02 |
| `default_account_cash_sms_restriction` | SMS entries use bank or wallet accounts. | معاملات الرسائل تستخدم حسابًا بنكيًا أو محفظة إلكترونية. | R3-02 |
| `default_account_first_helper` | Your first account is the default. | حسابك الأول هو الحساب الافتراضي. | R3-02 |
| `default_account_replace_cash` | Saving will replace Cash as your default. | عند الحفظ، سيصبح هذا الحساب افتراضيًا بدلًا من كاش. | R3-01 |
| `default_account_replace_named` | Saving will replace {{defaultAccountName}} as your default. | عند الحفظ، سيصبح هذا الحساب افتراضيًا بدلًا من {{defaultAccountName}}. | Same approved R3-01 statement with the *actual prior owned account name* substituted; no arbitrary “Cash” fallback for an account with another name |

`default_account` label **already existed** in both locales; its English value is aligned from `Default Account` to the exactly approved `Default account` without renaming its key or changing the Arabic value. The first five messages are verbatim approved R3 notes and T065 fixtures. Last key is a named-data interpolation of the approved replacement sentence, not a new financial rule; Root should confirm variable substitutions in device RTL/Bidi evidence. Unchanged `default_account_description` remains available to legacy views but the new field deliberately uses the eligible source/type-aware helper above.

## Transactions resource additions (48 matched pairs EN/AR)

**T031 shared-account details (21 keys):**
`account_review_details_title`;
`account_review_group_confirm`,
`account_review_group_confirmed`,
`account_review_group_view_all`,
`account_review_group_edit`,
`account_review_group_replace`,
`account_review_group_remove`,
`account_review_group_undo`,
`account_review_group_edit_submit`,
`account_review_group_edit_cancel`,
`account_review_group_change`,
`account_review_group_locked_currency`,
`account_review_group_edit_title`,
`account_review_group_name`,
`account_review_group_type`,
`account_review_group_linked`,
`account_review_group_close`,
`account_review_group_actions_title`,
`account_review_group_editor_close_a11y`,
`account_review_group_needs_review`,
`account_review_group_selected`. Both values copy the existing approved T031 fallback dictionary exactly; its code stays frozen.

**T038 choice/conflict sheets (9 keys):**
`account_review_choice_cancel`,
`account_review_choice_close`,
`account_review_choice_use_account`,
`account_review_choice_use_currency`,
`account_review_choice_empty`,
`account_review_choice_preserve_selection`,
`account_review_currency_title`,
`account_review_currency_choose_another`,
`account_review_currency_unselected`. EN/AR values use the existing T038 admitted fallback dictionary, not a new chooser.

**T060 active-filter and toolbar (5 keys):**
`account_review_filter_selected` = Selected / المحددة;
`account_review_select_ready` = Select ready / اختيار الجاهز;
`account_review_clear_selection` = Clear selection / إلغاء التحديد;
`account_review_empty_selected` = No selected transactions / لا توجد معاملات محددة;
`account_review_empty_selected_help` = Choose transactions from All to save them. / اختر المعاملات من «الكل» لحفظها.
Current `review_mode_all`, `review_mode_needs_review`, `show_all` keys already exist and are preserved.

**R3 scenario/action messages (13 keys):**
`account_review_group_effect_qnb3`,
`account_review_group_feedback_qnb3`,
`account_review_only_lunch_selected`,
`account_review_removed_qnb`,
`account_review_issue_account`,
`account_review_issue_currency`,
`account_review_issue_amount`,
`account_review_issue_category`,
`account_review_currency_context_lunch`,
`account_review_group_replace_qnb3`,
`account_review_save_failed`,
`account_review_try_save_again`,
`account_review_review_later`.
Values are the exact English and Arabic R3 interaction-notes phrases; these fixture-specific QNB3/Lunch keys are **not** general plural templates and must not be used for different group sizes or users. The future T054/T061 caller must supply canonical actual counts to the already approved group-disclosure/plural presentation helpers; no count is inferred in locale resources.

The count is 21 + 9 + 5 + 13 = **48 new paired keys**; no existing Transactions keys were renamed, removed or overwritten. The one scoped existing Accounts `default_account` EN label is sentence-case aligned with the owner-approved B1 text. Original `account_review_default_note_* / default_why_* / default_edit_reminder` plural keys are already present in both locales, unchanged. The separate voice/SMS parser labels and current generic recording/UI copy remain unchanged.

## Runtime and QA boundaries

The Add/Edit controlled field reads `accounts` namespace. T031/T038/T060 views already use actual namespaced `transactions` keys and fallback copies. This change supplies their previously missing resource entries; **it does not wire the review shell, modify shared components or activate action mutations.**

B1 proof to be completed by Root: EN/AR screenshot overlays; normal 390×844, 340 dp compact, font scale1.35, dark/RTL, large helper/long names, accessible switch selection and modal announcements. RNTL/Maestro do not establish device pixel/focus accuracy. No provider, native or hosted execution in this source lease. **NOT RUN.**
