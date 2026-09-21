# Mockup binding: home-collapsed-normal

- Approved reference image: home-collapsed-normal.png
- Approved reference image revision: sha256:2917097574d8190e7529085c0f7022b6fa4521c47f09ff278553cd64f3c54546
- Binding metadata approval: APPROVED
- Binding metadata revision: sha256:59258cdeeb8edab444b53797176bb22a9272543b80f29ba583987efc0f1b35a9
- Approved binding metadata revision: sha256:59258cdeeb8edab444b53797176bb22a9272543b80f29ba583987efc0f1b35a9
- Binding approval revision: sha256:24c2178273cac5a2c4232ff0f808577089298b8bf5958e4c3c12e38e81887c24
- Approved binding approval revision: sha256:24c2178273cac5a2c4232ff0f808577089298b8bf5958e4c3c12e38e81887c24
- Binding metadata approval evidence/reference: User approved the governing mockup set and no-glow correction in Codex task 01a08179-1115-70f1-ba53-a0ea25779a54 on 2026-09-21, then explicitly authorized recording final metadata on 2026-09-21 for sha256:24c2178273cac5a2c4232ff0f808577089298b8bf5958e4c3c12e38e81887c24.
- Legacy metadata migration: yes

## Binding Facts

- Binding product surface: Home dashboard Total Net Worth card and its collapsed wealth disclosure row.
- Declared comparison context: Ordinary-phone dark-theme Home composition; compare the app viewport after excluding non-binding device framing.
- Presentation-only framing: The phone hardware, status/navigation bars, outer canvas, export padding, and background outside the app viewport are non-binding.
- Spacing facts: Keep the dashboard content inset, net-worth card rhythm, disclosure divider, and normal gap between the net-worth card and expanded panel shown in the reference; touch targets remain at least 44 dp.
- Sizing facts: The net-worth card and expanded panel fill the dashboard content width; rounded card geometry and responsive tile widths follow centralized app breakpoints.
- Color/theme facts: Use existing Monyvi Nile-green, gold, silver, slate, surface, and text tokens; the expanded breakdown panel has an ordinary subtle slate border with no glow, halo, bloom, luminous shadow, or glowing connector.
- Typography facts: Preserve the approved hierarchy for hero value, disclosure, section title, tile labels, financial values, and percentage captions; financial values must not truncate.
- State facts: Positive nonzero net worth; disclosure row visible and collapsed; wealth breakdown panel absent; Live Rates follows the hero.
- Interaction behavior: Tapping `See where your money is` expands the breakdown; the disclosure exposes button role and expanded=false.
- Transition behavior: Expansion uses a restrained fade plus small downward reveal; Reduce Motion removes the animation; no looping or glowing motion.
- Responsive variants: Companion compact and enlarged-text references govern reflow; ordinary composition remains a single disclosure row.
- Dark-mode variants: This reference binds dark theme; light theme preserves the hierarchy using existing light tokens.
- RTL/Arabic variants: Companion Arabic RTL expanded reference governs mirroring and localized copy.
- Enlarged-text variants: Companion 200 percent reference governs wrapping and stacking.
- Fidelity-affecting unknowns: None.
