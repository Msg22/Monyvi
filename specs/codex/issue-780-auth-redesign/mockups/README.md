# Issue #780 — Premium authentication redesign

## Approved direction

Concept A, “Quiet Ledger,” is the implementation foundation.

- Default mode: Sign in.
- Brand: existing Monyvi wordmark; no replacement Arabic wordmark.
- English headline: “Your money, understood.”
- Arabic headline: “فلوسك كلها، واضحة قدامك.”
- Arabic brand eyebrow: “أهلًا بك في مونيڤي”.
- Illustration metaphor: voice, bank message, currency exchange, and
  precious-metal savings signals converge into one organized ledger.
- Welcome eyebrow remains in both locales by product decision, even though the
  original Concept A image omitted it.
- Privacy and Terms links appear in the footer but require separate public
  routes tracked outside issue #780.

## Vector asset

`financial-flow-illustration.svg` and `financial-flow-illustration-rtl.svg` are
standalone, resolution-independent illustration sources. They must not be
cropped from a raster mockup.

The approved geometry contains five routes: four strong source routes and one
faint contextual route entering from the headline side. Every route stops before
its icon boundary. Unexplained per-route shape markers are intentionally
omitted; only the convergence node remains. Currency uses a neutral banknote
instead of a country-specific code. Gold savings uses a double-rimmed coin with
an `Au` hallmark. Ledger note and checkmark have visible separation and use the
same flow-green stroke as every other geometry icon. Voice waveform and
microphone also retain a clear gap.

The RTL source mirrors layout coordinates but keeps semantic glyphs—including
the ledger checkmark—in their normal orientation.

The production React Native component should recreate this geometry with
`react-native-svg` and accept semantic theme colors as props. The SVG file
contains light/dark preview colors only; production colors must come from
existing Monyvi theme tokens.

`monyvi-wordmark.svg` is a mockup-only export of the existing wordmark paths in
`apps/mobile/components/ui/monyvi-logo-paths.ts`.

## Design system

- Cross-platform premium-neutral mobile composition.
- Palette limited to existing Nile green, slate, gold, and semantic error
  tokens.
- English typography uses the app's Inter 400/500/600/700 family.
- Arabic typography uses the app's Noto Sans Arabic 400/500/600/700 family.
- Language picker matches the existing `LanguageSwitcherPill`: `🌐`, locale
  code, and chevron.
- Google action uses the official multicolor Google G proportions and colors.
- Calm fintech hierarchy; no decorative card stacks or generic fintech charts.
- Minimum 44 dp interaction targets.
- Native safe-area and bottom-inset spacing.
- Inline field errors remain adjacent to the affected input.
- Submit loading uses an explicit disabled label state instead of replacing the
  entire form.
- Legal links remain visible in non-keyboard states.

## RTL behavior

- Page composition mirrors: language switcher, hero copy, illustration, mode
  order, labels, and directional back icon.
- Monyvi logo does not mirror.
- Email values remain LTR.
- Arabic password entry starts from the right.
- Password visibility icon moves to the physical left and receives reserved
  input padding, preventing overlap.
- Latin keyboard rows remain LTR even under Arabic locale.

## Responsive behavior

When the keyboard opens:

1. Keep logo and localized headline.
2. Remove decorative illustration, Google action, divider, and legal footer.
3. Keep mode switch, both fields, recovery link, and primary action above the
   keyboard.
4. Scroll focused input into view on short devices.
5. Restore the full composition when the keyboard closes.

## Approval mockups

Only two default Sign in renders are retained by product decision:

- English dark: `renders/auth-sign-in-en-dark.png`
- Arabic light: `renders/auth-sign-in-ar-light.png`

No separate validation, loading, recovery, sign-up, or keyboard-state mockups
are part of this approval handoff.

## Source

`auth-state-mockup.html` is a deterministic visual source used to render every
approved state without relying on AI-generated in-image text. It is a design
artifact, not production app code.

## Related follow-up issues

- #783 — public Privacy Policy and Terms pages.
- #784 — audit Sign in with Apple requirement for Google OAuth.
- #785 — obtain Egyptian privacy and Terms legal review.
