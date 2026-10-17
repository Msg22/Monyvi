# Proposed common visual contract — #395, binding package B1

Status: PENDING owner approval. Existing images remain byte-for-byte unchanged.

## What this package proposes

One exact handoff for the eight retained R1/R2 reference scopes and fifteen existing
R3 state frames. No image regeneration. Earlier approval of a concept does not
approve newly specified dp, token or responsive metadata. The numbers below are
explicit design-system proposals; they are not measurements of an uncalibrated
raster. Approval adopts these values while preserving each scoped composition.

- Normal comparison: 390×844 logical dp, font scale 1, portrait. Layout uses real
  runtime safe-area insets, applied once. Screens scroll; the fixture need not fit
  all its transactions into the viewport. No fixed status/navigation-bar heights.
- Review order: existing source header/transcript context, compact review details
  if needed, three filters, separate ready-selection toolbar, transaction list,
  existing financial disclaimer and safe-area footer. Existing Voice Retry and
  SMS Review later semantics remain source-specific; headers shown behind a sheet
  are contextual. No forced identical header between Voice and SMS.
- Normal horizontal gutter 20 dp. New detail panel width 350 dp, 1 dp border,
  12 dp corner radius and 16 dp internal padding; 318 dp inner width. Section gap
  12 dp; between title/subtitle 4 dp; identity/action gap 12 dp. Rows use 12 dp
  vertical padding and 1 dp separators. New detail rows have minimum height
  68 dp, never fixed height. Disclosure is directly beneath the relevant group.
- Account/type badge 40×40 dp with 22 dp Ionicons; transaction checkbox 24×24 dp
  inside a minimum 44×44 dp target. Menu/close target minimum 44×44 dp with 22 dp
  icon. Text actions have at least 44 dp target height. Buttons 48 dp minimum
  height, radius 8 dp, 12 dp horizontal padding. Outlined Confirm is distinct
  from read-only Confirmed. Row/menu/edit targets remain separate from checkboxes.
- New sheets: full available width, top radius 32 dp, 20 dp content gutter,
  max-height 80% of usable viewport; scroll body with reachable actions and runtime
  bottom inset. Handle 40×4 dp, top gap 12 dp, bottom gap 8 dp. Cancel/accept row
  gap 12 dp. Never stack two active sheets. Existing currency picker retains its
  established 20 dp gutters, 32 dp top radius, search/list appearance and direct
  row selection; R3-04 custom picker chrome is explicitly excluded.
- Add default block: after Initial balance, before existing SMS matching section.
  Reuse Edit's star/star-outline 22 dp; track 48×28 dp; thumb 24×24 dp; 12 dp
  star-to-label gap, 16 dp vertical/4 dp horizontal padding, 12 dp following gap.
  Label 16 dp semibold, helper 12 dp with 2 dp gap. Existing unrelated fields,
  providers, type selector and balance behavior remain the current form pattern.
- Typography: existing app font stack. Panel/sheet title 20 dp bold, identity and
  transaction title 16 dp semibold/bold, action 16 dp semibold, secondary metadata
  14 dp normal, helper/disclosure 12 dp normal; respective line heights 28/24/24/
  20/18 dp. No forced single-line truncation of critical identity/helper text.
- Themes: existing semantic background/surface/border/text primary/secondary/
  muted tokens plus their dark variants from the main-based Tailwind configuration.
  Main green CTA nileGreen-600, links nileGreen-700 light/nileGreen-400 dark;
  status review gold-800 light/gold-400 dark; remove red-600 light/red-500 dark;
  disabled slate-200 light/slate-700 dark with secondary text. Confirmation uses
  checkmark-circle; pending account business-outline/wallet-outline/cash-outline
  by type, issues alert-circle-outline, info information-circle-outline, menu
  ellipsis-vertical, edit pencil-outline, remove trash-outline, close close-outline.
  No generated blue lighting or unapproved decorative gradients. Keep the gold
  active-filter composition, using existing gold tokens; do not recolor it green.
- Motion: existing sheet slide entry/exit, no artificial mutation delay; update
  statuses/counts from committed local state. No added looping decoration. Reduced
  motion suppresses optional translation/fade. Cancel/Android Back commits nothing.
- Responsive: centralized compactPhone 340 dp, denseRowPhone 390 dp, tablet 600 dp,
  dense font scale 1.35. Preserve normal row when it fits. Reflow new dense rows
  below 390 dp or above scale 1.35: identity first, actions next, full-width
  disclosure; below 340 dp also stack paired actions. Tablet/landscape keeps source
  shell and gutter pattern, fluid panel width; never enlarge icons to fill space.
  Scroll instead of shrinking text; keyboard/safe-area footer remains reachable.
- RTL: mirror layout order and start/end alignment, use the R1 Arabic chooser and
  R3-15 Arabic combined composition, bidi-isolate codes/masked suffixes/signs.
  Use approved Arabic plus the copy table in the pinned R3 notes with localized
  plurals. User account names remain user data. EN/AR purpose and counts agree.
- Accessibility: named buttons/checkboxes/switches, checked/selected/disabled
  states, group count in action labels, single active modal focus boundary,
  announcements for confirmation/removal/save failure without stealing focus.
  Required fields use existing red-star semantics; no color-only status.

## Behavior and copy pinned for review

- Approved spec: sha256:e012f5a7d2edadc8bc1e2fa2ce03aeea56bc0c947dc02bfc2a3f166150e2c7d0 (receipt in approvals/spec-2026-10-14.json).
- R3 interaction/copy notes: sha256:2b4c8a42cb01a0148ef4e4ee6a09f158b60357ac3bb045b28ecd50b47e1ca5d4.
- Owner adjustments: sha256:f25dd143c5859437d4602fccc70a23036f3416895d852d362d4a72158827a2b4.
- Confirmation changes the group's account status only; direct eligible-row
  selection confirms its group after visible disclosure and checks only that row.
  Select ready is a separate toolbar action, scoped to the active filter, and
  never confirms unresolved groups. Selection counts are actual checked entries.
- Remove keeps transactions, clears invalid assignment/selection, offers
  session-local Undo that cannot overwrite later edits. SMS retains the removal
  across recovery; Voice remains session-only. No real account is removed.
- Choice from one transaction affects only that row; replacement from the group
  menu discloses the linked count and affects that group. Currency correction
  preserves the numeric amount and affects/regroups one transaction only.
- Currency picker opens unconfirmed, commits only on explicit currency row tap,
  returns to initiating review, and retains the localized context sub-label.
  The conflict sheet's Use action applies an explicitly selected candidate;
  opening Choose another currency closes/replaces that sheet first.
- Draft edit confirmation is explicit, stays within the group, and never creates
  the account before saving selected entries. Identity edits invalidate previous
  confirmation. Preserve financial opening-balance rules and source evidence.
- First account default is on/disabled with explanation; later Add defaults off,
  and enabling it changes persisted defaults only on successful Save.
- New copy is the EN/AR additions table in the pinned R3 notes; this package asks
  approval of those additions, not replacement of established unrelated copy.

## Precedence and limitations

R3-05/R3-15 bind final combined review; R2-01 remains the approved compact grouping
concept only. R2-02 binds the independent action sheet; R2-03 the full suggestions
list. R1-07 binds its foreground edit sheet; R1-08 only Edit's default block.
R3-03 extends R1-11's conflict sheet. R3-04 binds contextual copy and existing
picker reuse only. No superseded background, custom picker or separate old banner
can override these scopes. A proposed metadata value is not yet implementation
authority. No fidelity-affecting UNKNOWN is resolved by pretending raster pixels
are dp. Approval of this explicit proposed contract settles those values.

Device inset values, platform font rasterization and account fixtures are runtime
inputs, not fixed visual constants. Pixel fidelity, contrast and screen-reader
verification are future owner/device checks, not claimed as completed here.
