# Metals V1 Content Contract

**Scope:** bilingual user-facing content for Metals mockups. This document fixes meaning, wording, accessibility names, and locale behavior; it does **not** prescribe layout.
**Source of truth:** `spec.md` FR-025–059, FR-061–104; `docs/business/business-decisions.md` §§4–5.
**Keys:** keep message identifiers language-neutral. All examples use placeholders such as `{{amount}}`, `{{date}}`, and `{{holdingName}}`.

> **Decision note — 2026-08-25 (approved):** User-facing Arabic Dispose action is `لم تعد في حوزتي`. Use `التخلّص من الحيازة` only for formal/internal event terminology. Use **Live Rates** / `الأسعار المباشرة` only for confirmed Fresh rates; otherwise use **Rates** / `أسعار السوق` with explicit status.

## 1. Voice and terminology

- Calm, concrete, and financial. Say what changed, what remains, and what the user can do.
- Use **Live Rates** / `الأسعار المباشرة` only for confirmed Fresh rates. For cached, stale, unknown, failed-refresh, or unavailable rates, use **Rates** / `أسعار السوق` with explicit age or status.
- “Holding” means a physical metal holding. Do not use “asset” where “holding” is clearer.
- “Portfolio value” means value of Active holdings only. Market rates never imply ownership.
- Default visible copy avoids unrealized, realized P/L, and observed. For Active holdings, use `{{signedAmount}} since purchase`; for Sold holdings, use `{{amount}} profit from sold metals` or `{{amount}} loss from sold metals`. Internal calculations and audit evidence may retain the precise domain terms. Disposals and deleted records are excluded from sold-metal profit/loss.

## 2. Canonical vocabulary

| Concept | English | Arabic |
| --- | --- | --- |
| Metals | Metals | المعادن |
| Metal holding | Metal holding | حيازة معدن |
| Active | Active | نشطة |
| Sold | Sold | مباعة |
| Disposed | Disposed | تم التخلّص منها |
| Sell | Sell | بيع |
| Dispose user action | Dispose | لم تعد في حوزتي |
| Delete holding | Delete holding | حذف الحيازة |
| Undo terminal action | Undo | تراجع |
| Restore to Active | Restore to Active | استعادة الحيازة كنشطة |
| History | History | السجل |
| Gold / Silver | Gold / Silver | ذهب / فضة |
| Whole holding | Whole holding | الحيازة كاملة |
| Purchase price | Total purchase price | إجمالي سعر الشراء |
| Cost basis | Cost basis | أساس التكلفة |
| Gross proceeds | Gross sale proceeds | إجمالي حصيلة البيع |
| Sale fee | Sale fee | رسوم البيع |
| Net proceeds | Net proceeds | صافي الحصيلة |
| Current value | Current value | القيمة الحالية |
| Active performance | {{signedAmount}} since purchase | {{signedAmount}} منذ الشراء |
| Sold-metal profit | {{amount}} profit from sold metals | {{amount}} ربح من المعادن المباعة |
| Sold-metal loss | {{amount}} loss from sold metals | {{amount}} خسارة من المعادن المباعة |
| Gain / Loss | Gain / Loss | ربح / خسارة |
| Metal movement | Metal movement | أثر حركة سعر المعدن |
| Currency movement | Currency movement | أثر حركة سعر العملة |
| Purchase premium/cost | Purchase premium and costs | علاوة الشراء والتكاليف |
| Sale difference | Sale-price difference | فرق سعر البيع |
| Fee component | Sale fees | رسوم البيع |
| Attribution | P/L breakdown | تفصيل الربح أو الخسارة |
| Rounding note | Display rounding | تقريب العرض |
| Write-off | Cost-basis write-off | شطب أساس التكلفة |
| External transfer | External transfer | تحويل إلى خارج ملكيتك |
| Lost or stolen / Destroyed or damaged | Lost or stolen / Destroyed or damaged | مفقودة أو مسروقة / مدمرة أو تالفة |
| Given away / Donated | Given away / Donated | تم إعطاؤها للغير / متبرع بها |
| Other | Other | سبب آخر |
| Rate source | Rate source | مصدر السعر |
| Provider observation time | Rates updated | تم تحديث الأسعار |
| Rate quality | Rate quality | جودة السعر |
| Fresh / stale | Current / Stale | حديث / قديم |
| Unknown freshness | Freshness unknown | حداثة السعر غير معروفة |
| Missing rate | Rate unavailable | السعر غير متاح |
| Invalid rate | Invalid rate | سعر غير صالح |
| Local complete | Saved on this device | تم الحفظ على هذا الجهاز |
| Sync pending | Sync pending | المزامنة معلّقة |
| Sync failed | Sync failed | فشلت المزامنة |
| Incomplete action | Action needs recovery | الإجراء يحتاج إلى استعادة |

**Approved terminology:** `لم تعد في حوزتي` is the user-facing Arabic action. `التخلّص من الحيازة` remains reserved for formal/internal event terminology, including an event-status label where needed.

## 3. Action labels and status labels

| Intent | English | Arabic |
| --- | --- | --- |
| Add | Add holding | إضافة حيازة |
| Edit holding | Edit holding | تعديل الحيازة |
| Sell | Sell holding | بيع الحيازة |
| Dispose | No longer in my possession | لم تعد في حوزتي |
| Delete | Delete holding | حذف الحيازة |
| Undo | Undo | تراجع |
| View history | View history | عرض السجل |
| View rates | View rates | عرض الأسعار |
| Refresh | Refresh rates | تحديث الأسعار |
| Retry | Retry | إعادة المحاولة |
| Keep editing | Keep editing | متابعة التعديل |
| Discard changes | Discard changes | تجاهل التغييرات |
| Record sale | Record sale | تسجيل البيع |
| Confirm delete | Delete holding | حذف الحيازة |
| Confirm undo | Restore holding | استعادة الحيازة |
| Cancel | Cancel | إلغاء |

Do not shorten **Dispose** to “Remove,” “Delete,” or `حذف`. Do not use **Undo** for a temporary snackbar restoration of a delete; Metals Undo is a permanent-history reversal of a sale or disposal.

## 3a. Home net-worth breakdown and holding imagery

- **Approved title:** Where your money is / أين أموالك.
- **Composition constraint — Concept C:** This is an additive compact section directly below the existing Net worth total, not a Home redesign. Use an isolated pair of equal-width Accounts and Metals summary tiles. Preserve the existing header, greeting, net-worth hero, sections/cards, bottom navigation, theme behavior, tokens, and spacing language. Do not repeat full Accounts or Metals module content.
- **Source tiles:** Accounts / الحسابات; Metals / المعادن. Show each source as `{{amount}} · {{share}} of net worth` / `{{amount}} · {{share}} من صافي الثروة`. Do not add performance, sale proceeds, budgets, transactions, or snapshots as extra wealth sources.
- **Metals footer:** Gold / ذهب; Silver / فضة. These compact items are clearly nested inside Metals and use `{{amount}} · {{share}} of Metals` / `{{amount}} · {{share}} من المعادن`; they are not separate net-worth sources.
- **Destinations:** Accounts and Metals rows may open Accounts and My metals. **See all rates** / عرض كل الأسعار opens Live Rates. Rates content sits below the net-worth breakdown and never appears as a wealth source.
- **Themes:** Use one equivalent compact composition in light and dark themes; theme changes must not change source order, nesting, amounts, shares, or destinations.
- **Canonical illustration:** Accounts EGP 1,062,237.75 · 85.4% of net worth; Metals EGP 181,426.17 · 14.6% of net worth. Within Metals: Gold EGP 162,317.87 · 89.5% of Metals; Silver EGP 19,108.30 · 10.5% of Metals. Net worth: EGP 1,243,663.92.
- **Holding-row date:** `{{weight}} · Bought {{date}}` / `{{weight}} · تم الشراء {{date}}`. Omit this part entirely when no purchase date exists.
- **Holding render:** Monyvi supplies the illustrative render. Match Gold/Silver plus recorded coin, bar, or known jewelry form. For an unsupported form or shape, show a neutral material render. Always pair it with visible metal and form text and an accessible text label; no user-uploaded photo is offered.

## 3b. Holding performance and calculation disclosure

- **Active performance:** `{{signedAmount}} since purchase` / `{{signedAmount}} منذ الشراء`.
- **Sold performance, positive:** `{{amount}} profit from sold metals` / `{{amount}} ربح من المعادن المباعة`.
- **Sold performance, negative:** `{{amount}} loss from sold metals` / `{{amount}} خسارة من المعادن المباعة`.
- **Calculation disclosure:** How this value was calculated / كيفية حساب هذه القيمة.
- Keep the calculation disclosure in Holding Detail. Do not use “Rate and P/L details,” “unrealized,” “realized P/L,” or “observed” as default visible copy.

## 3c. Add Holding

- **Route:** One full-screen form with a compact live preview and direct submission from that form. / نموذج واحد بملء الشاشة، مع معاينة مباشرة ومختصرة وحفظ مباشر من النموذج نفسه.
- **Shared Add/Edit order:** Name; Metal; Weight and Purity; Total purchase price; Purchase currency; Purchase date; Physical form; Notes; conditional Correction reason; compact live preview; local-first status; primary CTA. Weight and Purity share a row when space permits. Other fields use the width needed for readable values and help text. Physical form and Notes stay visible. / الترتيب المشترك للإضافة والتعديل: الاسم؛ المعدن؛ الوزن والنقاوة؛ إجمالي سعر الشراء؛ عملة الشراء؛ تاريخ الشراء؛ الشكل المادي؛ الملاحظات؛ سبب التصحيح عند الحاجة؛ المعاينة المباشرة المختصرة؛ حالة الحفظ على الجهاز أولاً؛ زر الإجراء الأساسي. يظهر الوزن والنقاوة في صف واحد عندما تسمح المساحة. تستخدم الحقول الأخرى العرض اللازم لقراءة القيم والنص المساعد. يظل الشكل المادي والملاحظات ظاهرين.
- **Purchase-cost explanation:** This is the total amount paid, including workmanship, dealer premium, and other purchase costs. / هذا هو إجمالي المبلغ المدفوع، بما في ذلك المصنعية، وهامش التاجر، وأي تكاليف شراء أخرى.
- **Compact live preview:** Show holding identity, Estimated current value / القيمة الحالية التقديرية, the dynamic performance result, purity used, and rate freshness. Update it as valid inputs change; do not repeat the full form.
- **Dynamic performance:** Use Estimated gain since purchase / الربح التقديري منذ الشراء when positive; Estimated loss since purchase / الخسارة التقديرية منذ الشراء when negative; or Estimate unavailable / التقدير غير متاح when recorded facts or rates cannot support a trustworthy result. Do not label a negative or unsupported result as gain.
- **Purity disclosure:** Purity used to calculate value: `{{purityLabel}} · {{purityPercent}} pure`. / النقاوة المستخدمة لحساب القيمة: `{{purityLabel}} · {{purityPercent}} نقي`.
- **99.9% Gold sample:** Show the exact selected catalog label `24K · 999`; the explanatory purity value may separately say `99.9% pure`. Do not shorten the selection to `24K` or change it to `24K · 999.9`.
- **Rate and freshness disclosure:** Use the canonical rate summary, including the metal, `USD per pure gram`, source, and `Rates updated {{dateTime}}` when available. Do not substitute a local refresh or storage time.
- **Actions:** Add holding / إضافة حيازة (single primary direct commit); Cancel / إلغاء. No intermediate action or navigation step.
- **Pre-save local-first promise:** Your holding will be saved on this device. It will sync when a connection is available. / سيتم حفظ حيازتك على هذا الجهاز. وستتم مزامنتها عند توفر اتصال.

## 3d. Edit holding

- **Route:** One Edit holding form, not separate Edit Details and Correct purchase details routes. There is no separate purchase entity or journey. / نموذج واحد لتعديل الحيازة، وليس مسارين منفصلين لتعديل التفاصيل وتصحيح بيانات الشراء. لا توجد عملية أو كيان شراء منفصل.
- **Active Edit sequence:** Name; visible locked Metal; Weight and Purity; Total purchase price; Purchase currency; Purchase date; Physical form; Notes; conditional Correction reason; compact live preview; local-first status; `Save changes`. Every item except Metal is editable when applicable. Keep the complete form visible. / ترتيب تعديل الحيازة النشطة: الاسم؛ المعدن الظاهر والمقفل؛ الوزن والنقاوة؛ إجمالي سعر الشراء؛ عملة الشراء؛ تاريخ الشراء؛ الشكل المادي؛ الملاحظات؛ سبب التصحيح عند الحاجة؛ المعاينة المباشرة المختصرة؛ حالة الحفظ على الجهاز أولاً؛ «حفظ التغييرات». تكون جميع العناصر قابلة للتعديل عند انطباقها، باستثناء المعدن. أبقِ النموذج كاملاً ظاهراً.
- **Locked identity:** Metal type remains visible but can’t be changed. / يظل نوع المعدن ظاهراً، لكن لا يمكن تغييره.
- **Direct metadata save:** Compare fields with their saved values. When only Name or Notes changed, use Save changes / حفظ التغييرات. Do not show a correction reason or intermediate step.
- **Material correction:** Any difference in Weight, Purity, Physical form, Total purchase price, Purchase currency, or Purchase date shows that field’s persisted previous and current values inline, reveals required Correction reason / سبب التصحيح, and reveals a compact live `What will change` / ما الذي سيتغير section containing only affected facts and consequences. Keep all changes and submission in the same form. If every material field returns to its saved value, hide the previous-value cues, `What will change`, and Correction reason while retaining remaining Name or Notes changes.
- **Legacy unavailable facts:** Show an unavailable saved Weight, Purity, or Total purchase price as `Not recorded` / `غير مسجل`, never as zero. Before saving any material correction, require valid values for every unavailable required exact fact. Explain: `Some older holding details are missing. Complete Weight, Purity, and Total purchase price to save this correction.` / `بعض تفاصيل الحيازة القديمة مفقودة. أكمل الوزن والنقاوة وإجمالي سعر الشراء لحفظ هذا التصحيح.` Metadata-only Name/Notes saves remain available and do not invent those facts.
- **Locked metal guidance:** Metal can’t be changed. If you chose the wrong metal, use Delete holding, then add the correct holding. / لا يمكن تغيير المعدن. إذا اخترت المعدن الخطأ، استخدم حذف الحيازة، ثم أضف الحيازة الصحيحة.
- **Live-summary variables:** Physical-form-only: `Physical form: {{previousPhysicalForm}} → {{currentPhysicalForm}}`; `Current value stays {{amount}}.`; `Your {{profitOrLoss}} since purchase stays {{amount}}.`; `The holding image and description will update.`; `This correction will appear in History.` Financial changes: `Current value: {{previousCurrentValue}} → {{currentCurrentValue}}`; `{{previousProfitOrLoss}} since purchase: {{previousResult}} → {{currentProfitOrLoss}} since purchase: {{currentResult}}`. Preserve explicit stale, unknown, or unavailable-rate status instead of a fabricated figure.
- **Actions:** Save changes / حفظ التغييرات (single primary commit); Cancel / إلغاء. No intermediate action or navigation step.
- **Local-first save:** `Save changes` validates identically with or without a live financial consequence, preserves immutable original/corrected facts and audit history, applies all required consequences atomically, prevents duplicate submission, and gives accurate local-first success or error feedback. The pre-submit promise is `This change will be saved on this device first.`

## 4. Lifecycle copy and consequential confirmations

### Approved late-flow proof status — 2026-08-30

- **12 No Longer:** Approved direct live-summary form; 13 is retired/superseded/noncanonical as a separate review proof.
- **15 History (approved):** Use `Given away`, never `Gifted`; use `Lost or stolen`, never `Lost`.
- **16 Sold holding (approved):** Positive `Profit from this sale`; negative `Loss from this sale`.
- **17 Disposed holding (approved):** `Given away`, never `Gifted`, plus `No profit or loss from a sale.`
- **18 Restore holding (approved):** Positive `Profit from this sale is removed`; negative `Loss from this sale is removed`; future-tense helper `This change will be saved on this device first.`
- **14 Delete holding:** Remains approved. **19:** Backlog/noncanonical; defines no V1 behavior or implementation.

### Sell

- **Title:** Sell {{holdingName}} / بيع {{holdingName}}
- **Scope note:** This sells the whole holding. Partial sales are not available in V1. / سيُباع كامل الحيازة. لا تتوفر المبيعات الجزئية في الإصدار الأول.
- **Form and live summary:** Keep one editable sale form. Changes to sale amount, sale currency, fee, or account choice update `What will happen` with net proceeds, `{{profitOrLoss}} from this sale`, `{{holdingName}} will become Sold.`, exact selected-account increase or `No account balance will change.`, `This money is not ordinary income.`, and `This sale will appear in History.`
- **Account credit:** Field label `Receive money in`. Credit is optional; users may disable or change it. Preselect and enable only an active eligible default account with the same sale currency. Never select a mismatched default or convert automatically; clear a mismatched selection on currency change and permit the sale without credit when no matching account exists.
- **Account-credit prerequisite:** Keep `Receive money in` disabled until issue #242 revision-guards every account-balance writer and its regression suite is merged and verified. This prerequisite does not block recording a sale without account credit.
- **Direct action:** The visible live `What will happen` immediately above `Record sale` is the complete pre-action consequence disclosure. `Record sale` validates and commits directly; do not open a confirmation sheet, review route, or second confirmation. On local success/failure, use the established accurate success/navigation or retained-facts/retry feedback.
- **Pending Screen 10 proof correction (not an approval flag):** Entry labels are `Sale amount before fee`; explicit selectable `Sale currency` (sample `EGP`); and `Sale fee (optional)`. The fee always inherits the selected sale currency; never offer a fee-currency selector. Keep a persistent calculated `Net proceeds — {{currency}} {{amount}}` row (sample `Net proceeds — EGP 169,500.00`).
- **Screen 10 account detail:** Label `Receive money in`. When selected, show `Net proceeds will be added to {{accountName}}. This is not ordinary income.` Only matching-currency accounts are eligible; if none is eligible, the sale remains recordable without account credit.
- **Entry actions:** Preserve the whole-holding note and optional notes. `Record sale` validates and commits directly from the live summary; `Cancel` exits the form.
- **Live-summary labels:** Net proceeds; Profit or loss from this sale. / صافي الحصيلة؛ الربح أو الخسارة من هذا البيع.
- **Account-credit note:** Net proceeds will be added to {{accountName}}. This is not ordinary income. / سيُضاف صافي الحصيلة إلى {{accountName}}. لا يُعد ذلك دخلاً عادياً.

### Dispose

- **Direct No Longer:** `Lost or stolen`; `Destroyed or damaged`; `Given away`; `Donated`; `Other`. Known categories auto-map; only Other shows `Record a loss` / `Record it as moved out`. Loss says purchase cost is recorded as a loss, with no sale money/account credit. Moved out says holding leaves active metals with no sale profit/loss/account change.
- **Action:** Live affected-only `What will happen` is the complete disclosure above direct `Record change`; no Review route or second confirmation.

- **Title:** No longer in my possession: {{holdingName}} / لم تعد {{holdingName}} في حوزتي
- **Intro:** Use this when you no longer own the holding and did not sell it. / استخدم هذا الخيار عندما لا تعود الحيازة ملكك ولم تبعها.
- **Reason labels:** Lost or stolen; Destroyed or damaged; Given away; Donated; Other. / مفقودة أو مسروقة؛ مدمرة أو تالفة؛ تم إعطاؤها للغير؛ متبرع بها؛ سبب آخر.
- **Other required choice:** Choose how to record this: Record a loss or Record it as moved out. / اختر طريقة تسجيل ذلك: تسجيل خسارة أو تسجيل خروجها من ملكيتك.
- **Loss meaning:** Its purchase cost will be recorded as a loss. There is no sale money, account change, or profit or loss from a sale. / ستُسجَّل تكلفة شرائها كخسارة. لا توجد أموال بيع أو تغيّر في الحساب أو ربح أو خسارة من بيع.
- **Moved-out meaning:** It will leave your active metals. There is no sale money, account change, ordinary income, or profit or loss from a sale. / ستخرج من معادنك النشطة. لا توجد أموال بيع أو تغيّر في الحساب أو دخل عادي أو ربح أو خسارة من بيع.

### Delete holding

- **Title:** Delete holding? / حذف الحيازة؟
- **Body:** Only delete a holding added by mistake. It will be removed from your portfolio and History. Sell and No Longer are separate actions.
- **Confirm action:** Delete holding / حذف الحيازة.
- **Availability:** Never show for Sold or Disposed holdings. Explain: “To correct this terminal action, undo it first.” / «لتصحيح هذا الإجراء النهائي، تراجع عنه أولاً.»

### Undo sale or disposal

- **Title:** Undo {{action}}? / التراجع عن {{action}}؟
- **Body, sale:** This restores the same holding to Active. The sale stays in History as reversed. Any linked account credit will also be reversed. / سيؤدي ذلك إلى استعادة الحيازة نفسها كنشطة. سيبقى البيع في السجل باعتباره تم التراجع عنه. وسيُعكس أيضاً أي إيداع مرتبط في حساب.
- **Body, no-longer-in-possession record:** This restores the same holding to Active. The record remains in History as reversed. / سيؤدي ذلك إلى استعادة الحيازة نفسها كنشطة. سيبقى تسجيل عدم الحيازة في السجل باعتباره تم التراجع عنه.
- **Confirm action:** Restore holding / استعادة الحيازة.
- **Unsafe linked effect:** We couldn’t safely reverse the linked account effect. Nothing changed. Check the account and try again. / تعذر عكس الأثر المرتبط بالحساب بأمان. لم يتغير شيء. راجع الحساب ثم حاول مرة أخرى.

## 5. Rates, provenance, and unavailable financial values

| State | English | Arabic |
| --- | --- | --- |
| Fresh rate | Live Rates: current rate. Rates updated {{dateTime}} | الأسعار المباشرة: سعر حديث. تم تحديث الأسعار في {{dateTime}} |
| Stale rate | Rates: rate is older than 24 hours | أسعار السوق: مرّ أكثر من 24 ساعة على السعر |
| Unknown freshness | Rates: rate age is unknown | أسعار السوق: عمر السعر غير معروف |
| Missing current rate | Rates: current rate unavailable | أسعار السوق: السعر الحالي غير متاح |
| Invalid rate | Rates: this rate can’t be used | أسعار السوق: لا يمكن استخدام هذا السعر |
| Refresh failed with cache | Rates: couldn’t refresh. Showing the last available rate. | أسعار السوق: تعذر التحديث. نعرض آخر سعر متاح. |
| Retry refresh | Retry refresh | أعد محاولة التحديث |
| P/L unavailable — purchase cost | Profit/loss unavailable because the total purchase price is missing or unclear. Correct the holding details to add it. | الربح أو الخسارة غير متاحين لأن إجمالي سعر الشراء مفقود أو غير واضح. صحح تفاصيل الحيازة لإضافته. |
| P/L unavailable — rate/reference | Profit/loss unavailable because a required rate or historical reference is missing. | الربح أو الخسارة غير متاحين لأن سعراً مطلوباً أو مرجعاً تاريخياً مفقود. |
| Detail unavailable, combined available | Breakdown unavailable. Combined result is based on recorded facts. | التفصيل غير متاح. النتيجة الإجمالية مبنية على البيانات المسجلة. |
| Rounding difference | Displayed parts may differ from the total by up to {{amount}} because each value is rounded for display. | قد يختلف مجموع الأجزاء المعروضة عن الإجمالي بما يصل إلى {{amount}} بسبب تقريب كل قيمة للعرض. |

- Financial-review acknowledgment for stale input: “I understand that {{rateName}} is {{rateAge}} old.” / «أفهم أن {{rateName}} مرّ عليه {{rateAge}}.»
- Financial-review acknowledgment for unknown freshness: “I understand that the age of {{rateName}} is unknown.” / «أفهم أن عمر {{rateName}} غير معروف.»
- Name every affected metal or currency input; never use an unexplained generic “rates may be stale.”
- Provenance display sequence: **source, provider update time, quality/freshness**. Do not substitute local fetch, storage, sync, or action time for provider observation time.
- Unit label: **USD per pure gram** / **دولار أمريكي لكل غرام نقي**. Currency factors: **USD value of one {{currency}}** / **القيمة بالدولار الأمريكي لوحدة واحدة من {{currency}}**.

## 6. Local-first, sync, recovery, and conflict

| State | English | Arabic |
| --- | --- | --- |
| Local complete | Saved on this device | تم الحفظ على هذا الجهاز |
| Sync pending | Sync pending. Your saved change is still available here. | المزامنة معلّقة. تغييرك المحفوظ ما زال متاحاً هنا. |
| Synced | Synced | تمت المزامنة |
| Sync failed | Sync failed. Your saved change is still available on this device. Retry when you’re ready. | فشلت المزامنة. تغييرك المحفوظ ما زال متاحاً على هذا الجهاز. أعد المحاولة عندما تكون مستعداً. |
| Submission pending | Saving your change… | جارٍ حفظ التغيير… |
| Duplicate submission | This change is already being saved. | جارٍ حفظ هذا التغيير بالفعل. |
| Incomplete group | This action needs recovery. Your last complete state is still shown. | هذا الإجراء يحتاج إلى استعادة. نعرض آخر حالة مكتملة. |
| Recovery retry | Retry recovery | إعادة محاولة الاستعادة |
| Checking changes | Checking changes… | جارٍ التحقق من التغييرات… |
| Checking changes body | This holding changed on another device. We’re checking the holding and account before showing the final result. | تغيّرت هذه الحيازة على جهاز آخر. نتحقق من الحيازة والحساب قبل عرض النتيجة النهائية. |
| Holding changed on another device | Holding changed on another device | تغيّرت الحيازة على جهاز آخر |
| Holding-changed body | Another change was saved first. We kept it and safely removed this device’s pending change. | تم حفظ تغيير آخر أولاً. احتفظنا به وأزلنا بأمان التغيير المعلّق على هذا الجهاز. |
| View holding | View holding | عرض الحيازة |
| Try sync again | Try sync again | محاولة المزامنة مرة أخرى |

Do not say “saved” when the action is only pending. Do not say “synced” for a local-complete action that has not reached cloud synchronization. During automatic reconciliation, keep the last complete state effective, lock financial actions while checking is incomplete, and never expose rejected candidates as normal History.

## 7. Validation, progress, success, and failure

| Condition | English | Arabic |
| --- | --- | --- |
| Required field | Enter {{fieldName}}. | أدخل {{fieldName}}. |
| Positive number | Enter an amount greater than 0. | أدخل مبلغاً أكبر من 0. |
| Invalid number | Enter a valid number. | أدخل رقماً صالحاً. |
| Supported precision | Use no more than {{count}} decimal places. | استخدم ما لا يزيد على {{count}} منازل عشرية. |
| Weight | Enter a weight greater than 0 grams. | أدخل وزناً أكبر من 0 غرام. |
| Purchase date | Choose a purchase date that is not in the future. | اختر تاريخ شراء ليس في المستقبل. |
| Sale date | Choose a sale date on or after the purchase date, and not in the future. | اختر تاريخ بيع في تاريخ الشراء أو بعده، وليس في المستقبل. |
| Fee | Enter a fee from 0 to the gross sale proceeds. | أدخل رسوماً من 0 حتى إجمالي حصيلة البيع. |
| Other disposal | Choose Record a loss or Record it as moved out. | اختر تسجيل خسارة أو تسجيل خروجها من ملكيتك. |
| Unusual value | This value is unusually large. Review it before continuing. | هذه القيمة كبيرة على نحو غير معتاد. راجعها قبل المتابعة. |
| Error summary | Fix {{count}} fields before continuing. | صحح {{count}} حقول قبل المتابعة. |
| Saved | {{holdingName}} was saved on this device. | تم حفظ {{holdingName}} على هذا الجهاز. |
| Sale saved | Sale recorded. {{holdingName}} is now Sold. | تم تسجيل البيع. أصبحت {{holdingName}} مباعة. |
| No-longer-in-possession saved | Recorded: {{holdingName}} is no longer in your active portfolio. | تم تسجيل أن {{holdingName}} لم تعد ضمن محفظتك النشطة. |
| Delete saved | Holding deleted. | تم حذف الحيازة. |
| Undo saved | {{holdingName}} is Active again. | أصبحت {{holdingName}} نشطة مرة أخرى. |
| Generic safe failure | We couldn’t save this change. Nothing was changed. Try again. | تعذر حفظ هذا التغيير. لم يتغير شيء. حاول مرة أخرى. |
| Offline reassurance | Saved on this device. It will sync when a connection is available. | تم الحفظ على هذا الجهاز. ستتم مزامنته عند توفر اتصال. |

While submitting, disable repeated confirmation and prevent back, gesture dismissal, cancel, and competing actions. Preserve entered/reviewed facts after a failure. Move focus to the error summary, then first invalid field.

## 8. Dirty-exit prompts

- **Title:** Discard changes? / تجاهل التغييرات؟
- **Body:** Your unsaved changes will be lost. / ستفقد التغييرات غير المحفوظة.
- **Actions:** Keep editing / متابعة التعديل; Discard changes / تجاهل التغييرات.
- Use only for changed Add, Edit, Sell, or no-longer-in-my-possession forms. Do not promise draft recovery after restart.
- During a local submission, block dismissal rather than showing this prompt: “Saving your change. Please wait.” / «جارٍ حفظ التغيير. يرجى الانتظار.»

## 9. Spoken summaries and accessible names

All figures need a full text equivalent; do not rely on color, icon, strikethrough, position, or a badge alone. Use the visible label as the accessible name where it is self-sufficient; otherwise use these patterns.

| Surface | English spoken summary | Arabic spoken summary |
| --- | --- | --- |
| Portfolio total | Metals portfolio value {{amount}}. {{status}}. | قيمة محفظة المعادن {{amount}}. الحالة: {{status}}. |
| Active performance | {{signedAmount}} since purchase. {{trust}}. | {{signedAmount}} منذ الشراء. {{trust}}. |
| Sold-metal profit | {{amount}} profit from sold metals. | {{amount}} ربح من المعادن المباعة. |
| Sold-metal loss | {{amount}} loss from sold metals. | {{amount}} خسارة من المعادن المباعة. |
| Rate | {{metal}} rate: {{amount}} USD per pure gram. {{freshness}}. Source: {{source}}. Rates updated {{dateTime}}. | سعر {{metal}}: {{amount}} دولار أمريكي لكل غرام نقي. {{freshness}}. المصدر: {{source}}. تم تحديث الأسعار في {{dateTime}}. |
| Unavailable value | Current value unavailable. {{reason}}. Holding facts are still available. | القيمة الحالية غير متاحة. {{reason}}. بيانات الحيازة ما زالت متاحة. |
| Filter | {{filterName}} filter, {{selectedState}}, {{count}} holdings. | عامل التصفية {{filterName}}، {{selectedState}}، {{count}} حيازة. |
| History event | {{eventType}}, {{dateTime}}. {{effectiveState}}. | {{eventType}}، {{dateTime}}. {{effectiveState}}. |
| Automatic reconciliation | Changes are being checked. The last complete state remains active. | جارٍ التحقق من التغييرات. تظل آخر حالة مكتملة نشطة. |

Accessible labels:

- **Sell button:** “Sell {{holdingName}}” / “بيع {{holdingName}}”.
- **No-longer-in-my-possession button:** “Mark {{holdingName}} as no longer in my possession without a sale” / “تأكيد أن {{holdingName}} لم تعد في حوزتي من دون بيع”.
- **Delete button:** “Delete holding {{holdingName}}” / “حذف الحيازة {{holdingName}}”.
- **Undo button:** “Undo {{saleOrDisposal}} and restore {{holdingName}} to Active” / “التراجع عن {{saleOrDisposal}} واستعادة {{holdingName}} كنشطة”.
- **Expand P/L:** “Show profit/loss breakdown” / “إظهار تفصيل الربح أو الخسارة”; collapsed state is announced.
- **Refresh:** “Refresh market rates” / “تحديث أسعار السوق”.
- **Unavailable action:** include reason and recovery, e.g. “Sell unavailable while changes to this holding are being checked.” / “البيع غير متاح أثناء التحقق من تغييرات هذه الحيازة.”
- **Confirmation dialog:** announce title, consequence, final action, and cancel action; keep background controls unreachable.

## 10. Numbers, units, dates, and bidi

- Accept Western digits, Arabic-Indic digits, decimal point, and decimal comma on entry; normalize without changing user intent.
- Display money with Western digits (`0–9`) under current Monyvi convention. Keep currency code or symbol adjacent to its amount as one logical token: `EGP 12,500.00`, `USD 75.25`.
- In Arabic UI, retain Western digits for money, weights, rates, and dates. Use isolated LTR spans for currency codes, numeric values, `%`, `g`, `USD`, `EGP`, ISO dates, and signed P/L values so signs and units read correctly.
- Prefer explicit plus/minus text in accessible summaries: “gain”/“loss”, “ربح”/“خسارة”; never convey direction by color alone.
- Weight: `{{weight}} g` / `{{weight}} غ`; show up to three decimal places only when needed.
- Purity: preserve canonical user-facing karat or fineness label (for example, `21K`, `999.9 fineness`); never display only normalized factor to users.
- Rates: state denominator every time in detailed content: `USD per pure gram` / `دولار أمريكي لكل غرام نقي`.
- Dates: show unambiguous localized absolute dates in history, reviews, stale labels, and screen-reader output. Never use relative time alone for financial chronology. Use locale formatter for display, but retain full date and time for accessibility where events share a date.
- In Arabic prose containing a Latin holding name or currency code, isolate that token. Avoid punctuation immediately between an RTL phrase and a numeric LTR run.

## 11. Approval and implementation flags

- **Approved — 2026-08-25:** user-facing Arabic Dispose action is `لم تعد في حوزتي`; retain `التخلّص من الحيازة` only for formal/internal event terminology. **Live Rates** / `الأسعار المباشرة` is reserved for confirmed Fresh rates. All other rate states use **Rates** / `أسعار السوق` plus explicit status.
- **Approved and canonical:** 02 My Metals retains the approved Variant B portfolio hierarchy with Variant A holding cards/list, Monyvi-supplied realistic holding visuals, plain rates wording, no retired-metal behavior, exact `24K · 999` identity, and reconciled values.
- **Approved — 2026-08-29:** Preserve existing `/live-rates` visual appearance, layout, route, and visual patterns. 04 Live Rates is rejected, retired, and noncanonical; do not implement it. Reconcile only Gold/Silver/currency scope and truthful rate-status behavior/copy, while retaining the Home entry point, source disclosure, and refresh behavior.
- **Approved and canonical:** Add Holding is one complete form with the exact shared Add/Edit order, visible optional Physical form and Notes, compact live preview, dynamic Estimated gain/loss/unavailable copy, local-first status, and direct `Add holding`.
- **Approved and canonical:** Edit holding is one complete form and material-dirty state. It preserves the exact shared Add/Edit order, standard form colors, visible locked Metal, inline persisted/current values, required Correction reason, compact live `What will change`, local-first status, and direct `Save changes`.
- **Approved and canonical:** Delete and Undo retain focused confirmation sheets. Sell and No Longer commit directly from their live summaries. The 14 Delete confirmation uses its approved exact purity/value correction.
- **Approved — 2026-08-29:** 10 Sell holding live-summary form is final. It uses the approved editable whole-holding form, complete live `What will happen`, matching-currency optional account-credit behavior, and direct `Record sale`. 11 is retired/superseded/noncanonical traceability only.
- **Visual approval registry — complete:** Home Concept C, 02 My Metals, 03 Active holding detail, 05 Add holding, 08 Edit holding, 14 Delete confirmation, 15 History, and 17 Disposed detail are approved and promoted to canonical references. Screens 16 Sold detail and 18 Restore holding, plus every other previously approved visual, remain approved. Screen 19 remains backlog/noncanonical and is not approved for V1. Deferred responsive and state-proof scope remains unchanged.
- **Native-Arabic review before ship:** required for final pluralized count templates, long automatic-reconciliation explanations, and any value that composes Arabic with dynamic LTR account or holding names.
- **No legal-review flag:** this is product UI copy, not a binding policy or legal summary.
