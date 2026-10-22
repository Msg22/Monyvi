# Shared-account review R3 — proposed state and copy notes

Status: awaiting owner approval of the existing R3 proposals. Earlier retained R1/R2 approval stays separately recorded. No production code or further mockup generation.

## Existing-component authority

Monyvi's PageHeader, shared fields, account toggle, currency modal, review row/footer, responsive constants and theme tokens are the component authority. The new binding surfaces are the account toggle/helper additions, shared-account/issue information, actions and their transitions. Surrounding Add/Edit form context does not authorize replacing provider/SMS fields, account-type selectors, balance rules or requiredness. Phone framing/system chrome, generated lighting and outer canvas are presentation only.

The intended normal-phone composition is 390×844 logical dp; raster dimensions are not dp evidence. Exact values need approved binding facts before coding. User owns device/visual validation; no emulator runs.

## State matrix

| Image | Conditions / intended result |
| --- | --- |
| 01 | Later Add Account, default flag explicitly enabled; helper and replacement notice; Save applies change, cancel does not |
| 02 | First Cash account, default on/disabled proposal; first-account explanation and Cash Voice/SMS eligibility |
| 03 | Conflicting currency suggestions, neither confirmed; Choose another currency; account remains unassigned |
| 04 | Other-currency route; **reuse existing modal**, preserving transaction context per `../../adjustments.md`; illustrative custom chrome not binding |
| 05 | 7 total = QNB3 + CIB1 + default2 + currency1; 5 needing review, 2 selected; visible disclosure and Select ready |
| 06 | Separate 4-row removal fixture: QNB2 retained but unassigned + pending CIB1 + selected default1; review3/selected1, Undo |
| 07 | Default-only fixture, 2 ready/selected rows; quiet note only, no Review details container |
| 08 | 4 unresolved rows, one each for account/currency/amount/category; selected0; no default or draft banner |
| 09 | QNB3 + CIB1 confirmed; only Lunch selected; review0/selected1; one shared confirmation does not select all |
| 10 | Two confident existing-account matches, selected2; no empty Review details or default note; neutral existing account labels |
| 11 | Three confirmed/unselected rows; Selected filter empty; Show all recovery, disabled Save; no recorder no-results state |
| 12 | Why disclosure; friendly eligible-default explanation, ability to edit, Got it; background context is not another approved state |
| 13 | Existing-account replacement opened from group menu: explicitly affects all3; per-row R1 chooser still affects one row |
| 14 | SMS selected2; failed atomic save leaves choices; Try saving again and Review later; no successful creation claimed |
| 15 | Arabic/RTL combined fixture, same totals7/review5/selected2; quiet QNB shared-effect copy, currency issue1 and default count2 |

Fixtures are examples, not one continuous batch. Offscreen rows count toward totals; selected/default/group counts use their own domains. Filter/count arithmetic is not based on visible screenshot rows alone.

## Confirmation, selection and bulk actions

- Group Confirm removes only its account blocker. It creates no account and selects no rows.
- Direct eligible-card selection can confirm its shared account only with visible prior disclosure; feedback names the group count and only-clicked-row selection.
- Exactly three filters: All, Needs review, Selected. Bulk-ready action is a separate list toolbar, never a fourth filter. It selects eligible rows in the active filter, leaves unresolved groups unchanged and reports remaining unresolved rows. If all eligible visible-filter rows are selected, offer Clear selection; if none are ready, disable/omit the ready action without misleading success.
- Counts for a shared suggestion refer to its complete current linked group, not only visible/filtered rows. Missing-field summary counts may overlap; headline counts distinct transactions once.
- Every draft remains independently confirmable/changeable/removable, including in View all. Confirmed is read-only status; Change/menu stay available.

## Removal, Undo, currency and identity

- Removal leaves rows present, clears draft assignment, unchecks only newly-invalid selected rows and provides Choose account. Explicit named evidence prevents default fallback. Never delete real accounts.
- Undo is session-local recovery, not a promise across restart. Persist the removed/assigned state in SMS's existing durable review contract. If later user edits invalidate the removal snapshot, withdraw Undo rather than overwrite those edits. Voice remains session-only.
- Per-row choice detaches only that row; shared-menu replacement discloses and applies to the group. Cancel applies nothing. User choices win through filters/retries/refreshes.
- Currency confirmation preserves the numeric amount; one changed row detaches/regroups, without altering other transactions or existing account currencies. Unknown/conflicting currency cannot auto-assign an account.
- Same nickname is not proof of identity. Conflicting card/type/provider evidence stays separate and uses a valid distinguishing nickname. Material shared-draft identity edits invalidate prior confirmation. No automatic merge or invented provider metadata.
- At final Save, create only drafts referenced by valid selected rows with their financial records atomically. Preserve existing opening-balance/financial writer rules; no AI bank-balance inference. Failed saves/duplicate retries are recoverable and idempotent.

## Remaining existing-state patterns — no new mockups

- Loading: existing shared Skeleton/review loading composition; disable conflicting mutations until required state settles.
- Offline/stale: local review choices remain usable; reuse current offline notice. Preserve SMS durable choices. Provider parsing may still require network; do not claim offline AI parsing.
- Deleted/stale/foreign account: clear invalid choice and show the corresponding existing account recovery state before Save.
- Long lists/keyboard/enlarged text: scroll using existing shared layout, safe-area-aware footer/sheet and responsive reflow. Prevent clipping and sheet stacking; don't shrink fonts to cram all rows.
- Errors: specific friendly field/review messages; retain inputs and selection after failed operations. Never display a recorder no-results icon/state for filtered-empty rows or a successful review navigation.
- Light/dark variants use existing semantic tokens; no new palette. Accessibility roles, required names, checked/disabled states and account-specific menu names require focused automated coverage and owner-run screen-reader validation.

## Proposed EN/AR copy additions

Existing approved Arabic text remains. This table supplies additions/consistent wording for owner review; plural variants must use localized count handling, not concatenated English grammar.

| Meaning | English | Arabic |
| --- | --- | --- |
| Default flag | Default account | الحساب الافتراضي |
| Bank/Wallet helper | Used for new transactions and voice or SMS entries when no account is mentioned and the currency matches. | يُستخدم للمعاملات الجديدة ومعاملات الصوت والرسائل عندما لا يُذكر حساب وتطابق العملة عملة الحساب. |
| Cash helper | Used for new transactions and voice entries when no account is mentioned and the currency matches. | يُستخدم للمعاملات الجديدة ومعاملات الصوت عندما لا يُذكر حساب وتطابق العملة عملة الحساب. |
| Cash restriction | SMS entries use bank or wallet accounts. | معاملات الرسائل تستخدم حسابًا بنكيًا أو محفظة إلكترونية. |
| First account | Your first account is the default. | حسابك الأول هو الحساب الافتراضي. |
| Replace default | Saving will replace Cash as your default. | عند الحفظ، سيصبح هذا الحساب افتراضيًا بدلًا من كاش. |
| Other currency | Choose another currency | اختيار عملة أخرى |
| Context | For Lunch at Talabat | للغداء من طلبات |
| Unconfirmed account | No account is selected yet. | لم يتم اختيار حساب بعد. |
| Unified section | Review details | تفاصيل للمراجعة |
| Group disclosure | Selecting a QNB transaction confirms this account for all 3. | اختيار معاملة من QNB يؤكد الحساب للمعاملات الثلاث. |
| Group feedback | QNB confirmed for 3 transactions. | تم تأكيد QNB للمعاملات الثلاث. |
| Selection feedback | Only Lunch is selected. | تم اختيار معاملة الغداء فقط. |
| Ready action | Select ready | اختيار الجاهز |
| Clear | Clear selection | إلغاء التحديد |
| Removed | QNB suggestion removed | تمت إزالة اقتراح QNB |
| Undo | Undo | تراجع |
| Account issue | Choose an account | اختيار حساب |
| Currency issue | Confirm currency | تأكيد العملة |
| Amount issue | Check amount | مراجعة المبلغ |
| Category issue | Choose a category | اختيار فئة |
| Filter empty | No selected transactions | لا توجد معاملات محددة |
| Filter recovery | Choose transactions from All to save them. | اختر المعاملات من «الكل» لحفظها. |
| Filter recovery action | Show all | عرض الكل |
| Default explanation title | Default account used | تم استخدام الحساب الافتراضي |
| Default explanation | Cash was selected for 2 transactions because no account was mentioned and the currency matches. | تم اختيار كاش لمعاملتين لأن الحساب لم يُذكر والعملة تطابق عملة الحساب. |
| Edit reminder | You can change the account on each transaction before saving. | يمكنك تغيير الحساب لكل معاملة قبل الحفظ. |
| Group replacement | Replace QNB for all 3 linked transactions. | استبدال QNB للمعاملات الثلاث المرتبطة به. |
| Preserve selection | Transaction selections stay unchanged. | ستبقى المعاملات المحددة كما هي. |
| Save failure | Couldn't save your transactions. Your choices are still here. | لم نتمكن من حفظ معاملاتك. اختياراتك ما زالت محفوظة. |
| Retry save | Try saving again | محاولة الحفظ مرة أخرى |
| SMS recovery | Review later | مراجعة لاحقًا |

Copy describes assignment/confirmation, never uses “parsing” in the UI. Account names are user data, not translated labels. Bind codes, suffixes and amount signs with bidi isolation and the app's formatter. Account/currency/type eligibility rules are in the canonical specification.
