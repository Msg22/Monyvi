# Manual QA Plan: My Metals Portfolio Refinement

This manual QA plan verifies the approved My Metals portfolio refinement against the binding specification (`my-metals-dark-en.binding.md`) and reference image.

## 1. Test Environment Setup

- **Account**: Local manual QA account (`manual-qa@monyvi.test`, password `123456`) seeded via `npm run local:reset-and-seed`.
- **Theme**: Test in both Dark Mode (binding authority) and Light Mode.
- **Language / Direction**: Test in English (LTR) and Arabic (RTL).
- **Display Configurations**:
  - Standard handset: ~390 x 844 viewport (iOS / Android normal phone).
  - Compact handset: < 340 viewport width or Android compact screen.
  - Enlarged font: System font scale set to > 1.35x.

---

## 2. Test Verification Matrix

### 2.1 Header & Actions
- [ ] Header displays "Your Metals" when populated, with "Your Metals Value" subtitle.
- [ ] Top-right action is an icon-only `+` (add) button matching the Transactions and Accounts `PageHeader` pattern.
- [ ] Tapping `+` opens `AddHoldingModal`.
- [ ] No "Offline mode" banner or badge is shown on this screen.

### 2.2 Portfolio Allocation Strip
- [ ] Continuous two-tone horizontal rail displays Gold (gold-600) and Silver (silver-500) proportional shares.
- [ ] Allocation legend below displays Gold and Silver dots with percentages (e.g. `80.0%` / `20.0%`).
- [ ] When TalkBack / VoiceOver focuses the bar, it announces the localized description:
  - English: `"Portfolio allocation: 80.0% gold, 20.0% silver."`
  - Arabic: `"توزيع المحفظة: 80.0% ذهب، 20.0% فضة."`

### 2.3 Prices Per Gram Section
- [ ] Section title is "Prices per gram" (Arabic: "أسعار الغرام").
- [ ] Right-aligned compact timestamp displays observation time:
  - Same-day: `"Updated today, <time>"` (Arabic: `"آخر تحديث اليوم، <time>"`).
  - Past date: `"Updated <date>, <time>"` (Arabic: `"آخر تحديث <date>، <time>"`).
- [ ] Exactly four compact purity tiles are visible:
  - Gold 24K (`gold-999`)
  - Gold 21K (`gold-875`)
  - Gold 18K (`gold-750`)
  - Silver 999 (`silver-999`)
- [ ] Dark mode cards use raised card tokens: `bg-slate-800` and `border-slate-700` (matching proof card token `#172238` / `#2a3951`).
- [ ] Prices are derived from canonical purity entry factors and live metal rate snapshots in the preferred currency.
- [ ] Missing or stale rates show truthful fallback (e.g., `— / g` when rates are missing).
- [ ] No "Show all prices" button or explanatory helper text is displayed.

### 2.4 Your Items List & Card Interactions
- [ ] List section heading displays "Your items" (Arabic: "قطعك").
- [ ] Whole item cards are actionable buttons (`accessibilityRole="button"`).
- [ ] Each card has a trailing forward chevron (mirrored automatically in RTL).
- [ ] **Pressed feedback**: Pressing down on an item card provides subtle scale feedback (`transform: [{ scale: 0.99 }]`) and border color emphasis (`border-nileGreen-500` / `dark:border-nileGreen-400`).
- [ ] Tapping anywhere on the card navigates directly to `/metals/[id]`.
- [ ] In dark mode, card background is `dark:bg-slate-800` with `dark:border-slate-700`.

### 2.5 Responsive & Enlarged Text Behavior
- [ ] On standard viewport (390px width): Purity price tiles display in 2 columns (`w-[48.5%]`).
- [ ] On compact handset (< 340px width) or enlarged text (> 1.35x font scale):
  - Purity price tiles reflow to full width (`w-full`) to prevent rate and label clipping.
  - Item cards maintain legible typography and do not truncate holding names or currency values prematurely.
- [ ] Bottom safe area clearance ensures scroll content clears both the floating tab bar and quick action button.

---

## 3. Device-Only Gaps & Limitations

- **Physical Haptics**: Native press feel and immediate release response must be confirmed on real hardware.
- **Extreme Font Scaling**: Certain custom Android vendor skins (MIUI, OneUI) apply non-linear font scaling; physical verification is needed to ensure text wrapping behaves smoothly.
- **Physical Gestures vs Insets**: On physical devices with 3-button navigation bars versus full-gesture navigation, verify bottom tab clearance keeps list items fully visible when scrolled to the end.
