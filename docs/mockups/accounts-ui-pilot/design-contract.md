# Accounts pilot design contract — proposal

Status: APPROVED by Mohamed on 2026-10-11 for package sha256:265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e. Eight calibrated HTML/PNG design references; original generated concepts preserved separately. No app, device, accessibility-tree or screen-reader verification. Governing source: main 3264eba2b67bcc66cddc95e3fbdb36e8705ee642. Pending PR #383 head d45745a5c8a13db082eab24e12c2cc072e26c124 supplies integration context only. This package does not approve or duplicate its code.

## Scope and source

Use existing default field style for Add/Edit Account. Forms retain existing ordering, optional provider/SMS flow, PageHeader actions and balance-change interaction. Existing source inspected: app/(private)/add-account.tsx and edit-account.tsx; components/navigation/PageHeader.tsx; components/ui/TextField.tsx; components/add-account/{AccountTypeSelector,AccountPreviewCard,InstitutionProviderSection,SmsMatchingSection}.tsx; components/edit-account/{ReadOnlyDropdown,BalanceChangedSheet}.tsx; constants/{colors,accounts,ui}.ts; global.css; tailwind.config.js; utils/account-preview-presentation.ts; locales/{en,ar}/accounts.json. Names and balances are synthetic examples, not user data.

Original concepts are dedicated generations, never cropped out of a collage. Calibrated design candidates are deterministic HTML screenshots at exact declared PNG dimensions; original concepts are non-authoritative and preserved. Corrections removed invented preview flags, changed wallet glyphs to phone outlines, restored down chevrons, kept Edit default toggle unboxed and SMS card boxed, and preserved locked Edit controls behind balance sheet.

## Existing default geometry

These are source-derived logical values, not measurements fabricated from generated pixels.

| Element | Known source facts |
| --- | --- |
| Form content | 16 horizontal padding; existing vertical ScrollView; bottom content padding bottom inset +160 |
| PageHeader | 20 horizontal padding, margin top8, padding top inset+10, padding bottom16; navigation row height40 and bottom margin16; back target minimum44 square; arrow28 |
| Header title/action | Title24 bold; Save16 bold, light nileGreen700/dark nileGreen400; disabled action opacity0.5 |
| Default editable field | 16 radius, border1, padding16, value16 semibold; margin bottom16 |
| Default label | input-label:12 extra-bold, uppercase/tracking-widest, slate500/dark slate400, gap8, horizontal labelpadding4 |
| Inline error | gap6; horizontal padding8;12 bold red500 |
| Preview | radius30, horizontal20/vertical16 padding, margin bottom20; title16 black weight; provider/currency12 bold; balance18 black weight |
| Add Type | Horizontal ScrollView, gap8, endpadding16, cards height56/radius24, horizontal padding10, leading icon17 in32-square radius12 holder, selected checkmark20 |
| Add currency | Existing trigger radius16, border1, padding16; emoji text-xl20 within w-8; proposed shared SVG stand-in width20/aspect3:2, text16 medium; down chevron18 |
| Existing locked Edit | Current source radius12, horizontal16/vertical14 padding, label14 semibold, fill slate100/dark slate800 at50%; value16 medium; lock16 |
| Proposed unified locked Edit | Match default radius16 and shared input-label while preserving readable muted locked treatment and lock-info interaction; visible proposal approved in this package |
| SMS optional section | Radius16 border1, white/slate800, headerpadding16, chat icon19 in36-square radius12 holder; title16bold, help12semibold; expanded inner topborder/padding16 |
| Default-account toggle | Existing unboxed row, padding16 vertical/4 horizontal, margin bottom12, star22; switch48×28/thumb24 |
| Balance sheet | Topradius24, handle40×4, contenthorizontal24/top24, bottom padding max(inset+24,40); icon28 in56circle; title20bold; summaryradius16/padding16; optionsradius12/padding16; confirmationradius12/padding16 |

No new focus ring: current TextField has no focus color variation. Caret/focus-local draft stays; focus does not hide an error. Helper/warning samples demonstrate a proposed shared message contract rather than an existing Accounts warning.

## Palette and state contract

| Meaning | Existing registered token and value |
| --- | --- |
| Light background | slate50 #F8FAFC |
| Light surface | slate25 #FFFFFF |
| Dark background | slate900 #0F172A |
| Dark surface/border | slate800 #1E293B / slate700 #334155 |
| Default light border | slate200 #E2E8F0 |
| Input value | slate900 light / slate25 dark |
| Shared label | slate500 #64748B / slate400 #94A3B8 dark |
| Error/required marker | red500 #EF4444 |
| Abstract warning message | gold600 #D97706; does not add a financial warning |
| Selection | nileGreen500 #10B981 border/check; nileGreen50 #ECFDF5 light fill |
| Header Save | nileGreen700 #065F46 / nileGreen400 #34D399 dark |
| Bank preview fallback | blue800 #1E3A8A to slate800 light or slate950 #020617 dark |

Use registered NativeWind tokens in future code. Pressable opacity/shadow exceptions stay as governed. Calibrated colors and geometry use explicit CSS values; typography uses the documented reference font, which does not establish native metrics. Current source-backed preview gradient is retained; no decorative new gradient/background texture.

Proposed message order: error, then warning, then helper. Essential correction guidance remains visible. Error uses red message/border and retains malformed raw text. Warning stays advisory, without red border or new invalid/Save-disabled behavior. Disabled means temporarily noninteractive; locked Edit attributes remain readable and their lock explanation remains actionable.

## Requiredness and field inventory

| Surface | Field/section | Pilot semantics |
| --- | --- | --- |
| Add | Account Type, Account Name, Currency, Initial Balance | Required editable/input-selection facts; red asterisk, including preselected Type |
| Add | Bank/Wallet provider, sender aliases, Card Last4 | Existing conditional/optional validation unchanged; no blanket asterisk |
| Edit | Account Type/Currency | Locked display attributes, no required asterisk or chooser; lock can explain why |
| Edit | Account Name, Balance | Required editable fields |
| Edit | Default Account | Existing unboxed toggle, not a required field |
| Bank/Wallet | Message detection (Optional) | Existing collapsible group; aliases/card detail validation stays conditional |
| Cash | Provider/SMS | Existing absence preserved |
| Edit | Danger Zone/Delete Account | Existing continuation below SMS, below visible fold in references02/04; not removed or restyled |

Requiredness belongs exactly once in localized accessible name, including explicit overrides. Red stars alone and hints alone do not prove semantics. Announcements must be verified separately. Optional fields remain unmarked. No generic conditional FormField engine is proposed.

## Values, interactions and offscreen continuity

Add balance starts at canonical "0", remains nonnegative on submission. Edit accepts signed values. Canonical12345.678 is displayed as12,345.678 in input and12345.678 in preview; signed canonical-1234.567 displays-1,234.567 in Edit input. These demonstrate Account-accepted decimal length without imposing currency precision or input rounding. GroupedMoneyInput adoption must preserve dot-decimal canonical state and comma grouping; malformed12..34 and abc12345 remain visible verbatim until corrected. The state board explicitly shows abc12345, without inserting a comma. Preview currently returns trimmed balance string; no new rounding rule.

Preserve Type selector horizontal scrolling; no fixed grid or stacked replacement. Preserve supported currency list and modal selection/cancellation. Preserve nullable IDs, provider-aware local uniqueness, provider resets, optional sender/card controls and existing save-time conversions. This package changes no financial or offline persistence behavior.

Add order: preview, Type, Name, conditional provider, Currency, Initial Balance, conditional SMS. Edit order: preview, locked Type, locked Currency, Name, conditional provider, Balance, Default toggle, conditional SMS, existing Danger Zone. Expanded SMS still contains existing SenderChipsField and optional Card Last4 field; shown collapsed in screen references. Provider manual Other state remains existing conditional TextField. The eight-image package is not an exhaustive screenshot of every QA case.

Balance sheet: silent selected initially; tracked choice; Confirm submits selected choice. Dismissal uses backdrop or Android Back. There is no added Cancel button, close button or drag-to-dismiss interaction. Current summary displays two decimals; input precision remains independent. Sheet bottom clearance includes inset. Header Save is not a bottom CTA.

## Responsive and Arabic context

Intended ordinary target is390×844 logical dp, font scale1.0. Compact reference07 targets320×568, font scale1.5. constants/ui.ts owns compact340, dense390, tablet600 and dense-font1.35 thresholds. Preserve composition on ordinary phone; scroll/reflow only when measured space or text scale requires it. Compact Type row remains horizontal; form lower fields continue offscreen vertically rather than shrinking fonts.

AR mirror uses logical start/end, right-pointing Back on right, Save on left, right-aligned labels and values, left-positioned trailing picker/lock icons. Mixed currency/code and signed decimal tokens remain coherent LTR islands. Arabic image text is inspected visually; native bidirectional text, caret/IME and screen-reader behavior are unverified. No new Arabic terminology is approved by generating images.

Tablet/landscape and font variants still require eventual rendered comparison and interaction evidence; these generated proposals are not proof of responsive behavior.

## Calibrated references and approval gate

Eight .calibrated.html files render to exact declared PNG dimensions at device scale1. Body is anchored at x=0 for RTL/LTR, avoiding Windows headless minimum outer-window width cropping. This establishes1 CSS pixel to1 exported PNG pixel; it does not establish native dp or font equivalence. Arial/browser Arabic fallback is reference-only; no app font change. Ionicons uses the bundled reference font. Status and gesture rows are presentation/inset placeholders.

Currency SVG reference now measures20×13.333333; Add source uses emoji text-xl20 inside w-8, while Edit uses text-lg18. Shared20px glyph is a proposal; SVG versus platform emoji metrics remain uncalibrated. Balance sheet preserves source white/95 overlay, but native BlurView intensity20 is not reproduced or calibrated in HTML. Locked geometry and error > warning > helper precedence were approved as part of this exact package. Native font metrics, safe-area/device density, keyboard/IME, RTL caret, animations and screen-reader semantics remain UNKNOWN. Tablet/landscape references and native rendering are not supplied by this eight-image package; implementation must produce scoped evidence before shipping. No fidelity completion claim is made.

Each sidecar records actual PNG SHA-256, exact UTF-8/LF Binding Facts SHA-256, and the combined image/metadata revision. approval-manifest.json records eight tuples in filename order. Its package revision is SHA-256 over the eight bindingApprovalRevision values, each terminated with LF including the last line. All eight approval statuses/references are APPROVED for this exact package. Approval must identify an immutable combined revision; later image/fact changes invalidate approval. The repository verifier reports only pending approval requirements when draft integrity is valid.

Functional status: not implemented. Visual status: eight calibrated references rendered and inspected, approved for this exact package. Accessibility status: no native tree or screen-reader evidence. All35 QA scenarios remain NOT RUN. No production/tests/services/locales changes.

Approval evidence: Mohamed root-chat approval on 2026-10-11 after eight-image gallery/shared-state presentation; root thread 01a11c5a-ea30-70b0-a2d0-92991256a8b3; user message "approved"; package sha256:265cd15fefd32d9cece643179abbe4ed3843db82c74abe9c21b9dccc73dcf15e. Native/device execution and fidelity completion remain unverified.
