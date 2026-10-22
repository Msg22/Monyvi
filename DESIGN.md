---
name: Monyvi
description: Offline-first personal finance companion for Egyptian users
colors:
  nile-green-900: "#022C22"
  nile-green-800: "#064E3B"
  nile-green-700: "#065F46"
  nile-green-600: "#059669"
  nile-green-500: "#10B981"
  nile-green-400: "#34D399"
  nile-green-100: "#D1FAE5"
  nile-green-50: "#ECFDF5"
  gold-800: "#92400E"
  gold-600: "#D97706"
  gold-500: "#F59E0B"
  gold-400: "#FBBF24"
  gold-100: "#FEF3C7"
  gold-50: "#F5E6C8"
  red-600: "#DC2626"
  red-500: "#EF4444"
  red-100: "#FEE2E2"
  blue-900: "#172554"
  blue-800: "#1E3A8A"
  blue-600: "#2563EB"
  blue-500: "#3B82F6"
  blue-100: "#DBEAFE"
  blue-50: "#EFF6FF"
  violet-800: "#5B21B6"
  violet-700: "#7C3AED"
  violet-500: "#8B5CF6"
  violet-100: "#EDE9FE"
  slate-950: "#020617"
  slate-900: "#0F172A"
  slate-800: "#1E293B"
  slate-700: "#334155"
  slate-600: "#475569"
  slate-500: "#64748B"
  slate-400: "#94A3B8"
  slate-300: "#CBD5E1"
  slate-200: "#E2E8F0"
  slate-100: "#F1F5F9"
  slate-50: "#F8FAFC"
  slate-25: "#FFFFFF"
typography:
  display:
    fontFamily: "Inter_700Bold, NotoSansArabic_700Bold, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0"
  headline:
    fontFamily: "Inter_700Bold, NotoSansArabic_700Bold, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.214
    letterSpacing: "0"
  title:
    fontFamily:
      "Inter_600SemiBold, NotoSansArabic_600SemiBold, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0"
  body:
    fontFamily:
      "Inter_400Regular, NotoSansArabic_400Regular, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.429
    letterSpacing: "0"
  label:
    fontFamily:
      "Inter_500Medium, NotoSansArabic_500Medium, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.333
    letterSpacing: "0.08em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.nile-green-600}"
    textColor: "{colors.slate-25}"
    rounded: "{rounded.full}"
    padding: "14px 32px"
  button-secondary:
    backgroundColor: "{colors.slate-100}"
    textColor: "{colors.slate-800}"
    rounded: "{rounded.full}"
    padding: "14px 32px"
  input-field:
    backgroundColor: "{colors.slate-25}"
    textColor: "{colors.slate-900}"
    rounded: "{rounded.lg}"
    padding: "16px"
  dropdown-trigger:
    backgroundColor: "{colors.slate-25}"
    textColor: "{colors.slate-900}"
    rounded: "{rounded.lg}"
    padding: "16px"
  chip-sender:
    backgroundColor: "{colors.nile-green-50}"
    textColor: "{colors.nile-green-800}"
    rounded: "{rounded.full}"
    padding: "8px 12px"
---

# Design System: Monyvi

## Shared selection and keyboard standards (2026-10-20)

**Global picker/form behavior (owner-approved 2026-10-20):**

- Reuse the shared `Dropdown`/`CurrencyPicker` and `TextField` patterns. The
  CURRENT option on any opened dropdown/picker has a **filled Nile-green
  background with white readable text** in light/dark; selected icons/checks are
  white and high-contrast, never green on green. Show the real selected
  value/accessibility state on open, not a default guess or tint-only signal.
- Keep ALL focused text inputs, including the last one in a form/sheet, visible
  and reachable when the iOS/Android keyboard opens on small screens and large
  fonts. Use measured available keyboard-adjusted viewport and header/footer/
  safe-area space with focus scrolling; don't rely on hardcoded keyboard gaps or
  fixed nominal screen height. Keep cancel/submit reachable.
- Verify chosen-option state in real source/render contracts; obtain explicit
  native/manual dark-mode contrast, keyboard, RTL and font-size evidence before
  marking visual/accessibility PASS. Shared enforcement and gradual audits of
  bespoke controls remain separate work; no all-screen compliance is implied.

## 1. Overview

**Creative North Star: "The Trusted Ledger"**

Monyvi should feel like a personal financial ledger that became fast, local, and
conversational. The system is calm and practical first: a user should know what
account they are editing, what data will help automation, and how to save
without hunting through the screen.

The design language is restrained product UI with Egyptian financial context. It
uses slate surfaces, Nile green action color, gold only when the meaning is
wealth, metals, or warning, and clear type hierarchy. It rejects decorative
fintech cliches, crypto intensity, glassmorphism, heavy purple-blue gradients,
and generic AI-generated layouts.

Light mode is for daylight money maintenance: quick entry, scanning balances,
and form completion in normal mobile use. Dark mode is for lower-light checking,
late edits, and users who prefer reduced glare. Both themes must feel like the
same product, not two separate visual identities.

**Key Characteristics:**

- Calm financial hierarchy with clear save paths.
- Familiar mobile controls with premium spacing and state feedback.
- Arabic and English parity across labels, search, layout, and typography.
- Local-first confidence through skeletons, persistent state, and recoverable
  errors.
- Brand presence through Nile green restraint, not decoration.

## 2. Colors

The palette is a restrained finance system: cool slate surfaces, Nile green for
trust and action, gold for wealth context, and small semantic accents for
status.

### Primary

- **Deep Nile Green**: Primary brand identity and high-confidence accents. Use
  the darker values for brand presence and selected states.
- **Action Nile Green**: Primary actions, success, current selections, and
  trusted automation affordances. It should be visible but rare.

### Secondary

- **Measured Gold**: Wealth, metals, warning, and market-rate emphasis. Gold is
  meaningful, never decorative filler.
- **Bank Blue**: Bank-related supporting context, informational states, and
  provider identity helpers where green would imply action.

### Tertiary

- **Utility Violet**: Reserved for secondary categorization or specialized
  product surfaces. It must not become the main brand accent.
- **Expense Red**: Destructive actions, validation errors, and expense states.
  It must communicate attention without overwhelming financial forms.

### Neutral

- **Slate Paper**: Light backgrounds and large app surfaces.
- **Slate Ink**: Dark text, dark mode backgrounds, and strong contrast surfaces.
- **Slate Border**: Dividers, input outlines, card borders, and quiet
  separation.
- **White Surface**: Light-mode cards and fields. Use through the registered
  `slate-25` token or semantic `surface`, not raw JSX hex literals.

### Named Rules

**The One Accent Rule.** Nile green is the action voice. Do not add a competing
primary accent to forms, nav, or account setup.

**The Gold Has Meaning Rule.** Gold appears for wealth, metals, warnings, or
market context only. Do not use gold simply because this is a finance app.

**The Slate Does The Work Rule.** Most hierarchy should come from slate
surfaces, borders, text weights, and spacing. Color should confirm meaning, not
carry layout.

## 3. Typography

**Display Font:** Inter for LTR UI, Noto Sans Arabic for RTL UI. **Body Font:**
Inter for LTR UI, Noto Sans Arabic for RTL UI. **Label/Mono Font:** No separate
mono font is currently part of the system.

**Character:** The type system is native, clean, and task-focused. It should
make money values and form labels easy to scan without feeling like a banking
terminal.

### Hierarchy

- **Display** (700, 32px, 40px line height): Large financial totals and rare
  major emphasis.
- **Headline** (700, 28px, 34px line height): Primary screen titles and focused
  hero moments.
- **Title** (600, 20px, 26px line height): Section titles, grouped form regions,
  and card titles.
- **Body** (400, 14px, 20px line height): Normal explanatory copy, list content,
  and supporting text. Keep prose within 65 to 75 characters per line when a
  surface allows it.
- **Label** (500 to 800, 12px, 16px line height): Field labels, metadata, and
  compact affordances. Existing input labels use uppercase with wide tracking;
  avoid adding more uppercase labels unless they improve scanning.

### Named Rules

**The Locale Leads Rule.** Arabic screens use Noto Sans Arabic and RTL-aware
layout. English screens use Inter and LTR spacing. Do not force one font system
onto both languages.

**The Money Is The Headline Rule.** Use the largest type for balances, totals,
and account identity. Do not spend hero-scale type on instructional copy.

## 4. Elevation

Monyvi uses tonal layering first and light elevation second. Most surfaces are
separated with background color, border, and spacing. Shadows may support
primary buttons, bottom sheets, overlays, or floating controls, but they should
never make the app feel heavy.

### Shadow Vocabulary

- **Action Lift** (`elevation: 2`, `shadowOpacity: 0.1`, `shadowRadius: 4px`):
  Used sparingly on primary actions where NativeWind shadow classes are unsafe
  on touchables.
- **Sheet Lift**: Bottom sheets use overlay, rounded top corners, and surface
  contrast more than dramatic shadow.
- **Card Rest**: Cards and form fields are flat at rest, relying on borders and
  tonal surfaces.

### Named Rules

**The Flat At Rest Rule.** A normal form field, card, or list row should not
need a visible shadow. Add lift only when the element floats, overlays, or
responds to interaction.

## 5. Components

### Buttons

- **Shape:** Full pill for standard actions. Dashed optional actions may use a
  larger rounded rectangle when the dashed border is the affordance.
- **Primary:** Nile green background with white text, medium-to-bold label
  weight, and enough horizontal padding to feel deliberate.
- **Hover / Focus:** Mobile pressed state should be subtle opacity or tonal
  feedback. Do not animate layout properties.
- **Secondary / Ghost / Danger:** Secondary actions use slate tonal backgrounds
  or transparent ghost treatment. Danger uses red only where the action can
  destroy or remove data.

### Chips

- **Style:** Sender chips and compact tags should be small, rounded, and
  readable. Use Nile green tint for trusted or selected metadata and slate tint
  for neutral metadata.
- **State:** Removable chips need a clear close affordance. Duplicate or invalid
  values should show error text near the field, not only a red chip.

### Cards / Containers

- **Corner Style:** Use 16px to 24px radius for mobile surfaces, depending on
  density. Do not nest cards inside cards.
- **Background:** Light mode uses white or slate-50/surface. Dark mode uses
  slate-800 or slate-900.
- **Shadow Strategy:** Flat by default. Use borders and surface contrast before
  adding shadows.
- **Border:** Slate-200 in light mode and slate-700 in dark mode are the default
  quiet borders.
- **Internal Padding:** 16px is the normal compact surface padding; 24px is for
  prominent form groups or sheets.

### Inputs / Fields

- **Style:** Rounded 16px field, clear label, white or slate-800 background,
  slate border, and strong text color.
- **Focus:** Focus should increase confidence through border or tonal emphasis.
  It should not introduce new colors beyond the existing palette.
- **Error / Disabled:** Error uses red border and short red helper copy.
  Disabled states reduce opacity and must remain legible.

### Navigation

- **Style:** Use `PageHeader` for private screens. Header copy is compact and
  clear, with icon buttons for known actions and text only when the command
  needs clarification.
- **Mobile treatment:** Safe area is applied once. Bottom padding must account
  for tab bars, keyboard behavior, and fixed submit actions.

### Institution Picker

- **Style:** Provider pickers should show logo, short name, full name, and
  Arabic-searchable metadata where available.
- **Behavior:** Known providers use the registry and visual asset map. Other
  providers reveal manual text entry and fallback bank or wallet icons.
- **Search:** English search must match English metadata; Arabic search must
  match Arabic metadata even when the app language is English.

### Sender Entry

- **Style:** Sender values appear as chips with an adjacent input to add more.
- **Behavior:** Preset senders are editable. Custom senders are allowed and
  should be marked as unverified without blocking save.
- **Validation:** Empty values and duplicates after trimming and
  case-normalization are rejected with friendly copy.

## 6. Do's and Don'ts

### Do:

- **Do** use `bg-background`, `bg-surface`, `text-text-primary`,
  `text-text-secondary`, `text-text-muted`, and `border-border` before reaching
  for raw palette classes.
- **Do** use `TextField`, `Dropdown`, `OptionalSection`, `PageHeader`, and
  `Skeleton` before creating a local variant.
- **Do** show bank and wallet provider identity with both text and logo when the
  provider is known.
- **Do** keep account setup easy to understand in the first three seconds:
  account nickname, provider, sender metadata, balance, and save path must be
  visually obvious.
- **Do** support Arabic and English search for Egyptian provider metadata.
- **Do** use skeletons for content loading and short button progress only for
  already-visible actions.
- **Do** preserve dark-mode parity for every new component state.

### Don't:

- **Don't** use generic fintech navy-and-gold cliches, crypto intensity, or
  banking-institution coldness.
- **Don't** use glassmorphism, gradient orbs, bokeh blobs, heavy purple-blue
  gradients, or decoration that does not serve the user's task.
- **Don't** create nested cards, side-stripe accent borders, gradient text, or
  modal-first explanations when inline or bottom-sheet UI is clearer.
- **Don't** hardcode hex colors in JSX. Add missing palette values to
  `tailwind.config.js` deliberately.
- **Don't** use `StyleSheet.create` or inline styles unless the project rules
  allow the exception, such as NativeWind touchable shadow crashes or dynamic
  runtime values.
- **Don't** hide financial meaning behind clever labels. Account name, provider,
  sender names, card last four, currency, and balance need plain labels.
- **Don't** ask for full card numbers, PINs, passwords, or credentials in
  account setup copy or UI.
