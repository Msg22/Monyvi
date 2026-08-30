# Home wealth section — approved Concept C

Status: **approved canonical Home section reference**. The board shows the same ordinary-phone component in light and dark; no Home shell, hero, Rates, navigation, or app code is included.

## Files and integrity

| File | Board dimensions | Component width / height | Bytes | SHA-256 |
|---|---:|---:|---:|---|
| `concept-c-proportional-summary.png` | 1639x960 | approximately 492x326 | 1,046,567 | `91d39c5c02af44b3db1c7739a22e52bc9c3331f7bbf191dcbd09214ffa740498` |

The approved board was inspected at its native 1639x960 resolution. Component bounds are approximate; its visible label preserves the intended 420 px phone context.

Approval status: Concept C is the canonical Gold + Silver V1 direction.

## Canonical Concept C contract

- Title: `Where your money is`.
- Total: `EGP 1,243,663.92`.
- Accounts: `EGP 1,062,237.75` and `85.4% of net worth`.
- Metals: `EGP 181,426.17` and `14.6% of net worth`.
- Inside Metals: Gold `EGP 162,317.87` / `89.5% of Metals`; Silver `EGP 19,108.30` / `10.5% of Metals`.
- Rates remain excluded. Every percentage has a written denominator; color is only a scanning aid.

## Concept rationale

### C — Summary tiles

Short, tactile composition. Two exactly equal-width summary tiles avoid implying a false visual proportion; written 85.4% and 14.6% values carry the hierarchy without a chart. One balanced two-cell line carries Gold and Silver only, keeping the section compact and readable at a glance.

## Monyvi design system

- Monyvi Inter typography and tabular financial numerals.
- Nile green for Accounts/action hierarchy; measured gold only for Metals identity; slate neutrals for Silver.
- Light surfaces use slate-50/white semantics; dark surfaces use slate-950/slate-900 semantics with dark-safe Nile and gold accents.
- Flat-at-rest React Native-feasible structures: flex/grid rows, 24 px outer radius, and 10-18 px internal rhythm.
- No double bezel, glass, chemical badges, decorative metal objects, ERP table rhythm, nested dashboard, or theme-only structural changes.

## Production notes

- Section reference only. Implementation must validate compact phones, Arabic/RTL, 200% text, dynamic currencies, large values, and accessibility labels.
- Keep at least 44 px tap targets if Accounts or Metals become links; visual row height may remain compact while the pressable wrapper expands.
- C establishes `Amounts in EGP` once above the metal line to preserve readable captions at phone width.

## Provenance and review

The original Concept C board was deterministically rendered from one HTML/CSS/SVG design source with shared light/dark markup and Monyvi semantic tokens. After exact `24K · 999` valuation rules changed the sample totals, one targeted image-generation edit corrected only those figures in both themes. Mohamed approved that correction; it was promoted byte-for-byte without resampling. The exporter preserved aspect ratio at 1639x960. No stock assets, Home-shell reconstruction, or application files were used. The promoted board passed copy, arithmetic, denominator, theme-parity, crop, hash, and original-resolution readability review.

Approved direction: Concept C for the Home section. Its equal-width Accounts/Metals tiles avoid a false proportional cue, while explicit percentages carry the comparison and the balanced Gold/Silver footer keeps V1 compact.
