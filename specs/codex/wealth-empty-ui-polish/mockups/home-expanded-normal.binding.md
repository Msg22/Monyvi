# Mockup binding: home-expanded-normal

- Approved reference image: home-expanded-normal.png
- Approved reference image revision: sha256:67e1fb3db889b65976a23cb693402e8f33e65373f102a639d86b7c222e9334c1
- Binding metadata approval: APPROVED
- Binding metadata revision: sha256:4e5528b12a88a5431535dd5e89b78f4196eaeea7928d2d1e5b34cd1106e60e8c
- Approved binding metadata revision: sha256:4e5528b12a88a5431535dd5e89b78f4196eaeea7928d2d1e5b34cd1106e60e8c
- Binding approval revision: sha256:32462d8f774ece2ad1a7b64d82ea1760bcdb833716a2355e347fe5cfcb02ff1e
- Approved binding approval revision: sha256:32462d8f774ece2ad1a7b64d82ea1760bcdb833716a2355e347fe5cfcb02ff1e
- Binding metadata approval evidence/reference: User approved the governing mockup set and no-glow correction in Codex task 01a08179-1115-70f1-ba53-a0ea25779a54 on 2026-09-21, then explicitly authorized recording final metadata on 2026-09-21 for sha256:32462d8f774ece2ad1a7b64d82ea1760bcdb833716a2355e347fe5cfcb02ff1e.
- Legacy metadata migration: yes

## Binding Facts

- Binding product surface: Home dashboard Total Net Worth disclosure in expanded state and the wealth breakdown panel directly beneath it.
- Declared comparison context: Ordinary-phone dark-theme Home composition; compare the app viewport after excluding non-binding device framing.
- Presentation-only framing: The phone hardware, status/navigation bars, outer canvas, export padding, and background outside the app viewport are non-binding.
- Spacing facts: Keep the dashboard content inset, net-worth card rhythm, disclosure divider, and normal gap between the net-worth card and expanded panel shown in the reference; touch targets remain at least 44 dp.
- Sizing facts: The net-worth card and expanded panel fill the dashboard content width; rounded card geometry and responsive tile widths follow centralized app breakpoints.
- Color/theme facts: Use existing Monyvi Nile-green, gold, silver, slate, surface, and text tokens; the expanded breakdown panel has an ordinary subtle slate border with no glow, halo, bloom, luminous shadow, or glowing connector.
- Typography facts: Preserve the approved hierarchy for hero value, disclosure, section title, tile labels, financial values, and percentage captions; financial values must not truncate.
- State facts: Positive nonzero net worth; disclosure reads `Hide breakdown`; panel contains title, close control, Accounts and Gold & silver summary tiles, then separate Gold and Silver detail tiles; the panel does not repeat the overall net-worth value.
- Interaction behavior: Disclosure or close X collapses the panel; Accounts and Gold & silver tiles remain navigable and expose meaningful accessibility labels.
- Transition behavior: Entry and exit use a restrained fade plus small vertical movement; Reduce Motion removes animation; no glow or loop.
- Responsive variants: Companion compact and enlarged-text references govern stacking without changing hierarchy.
- Dark-mode variants: This reference binds dark theme; light theme preserves hierarchy with existing light tokens.
- RTL/Arabic variants: Companion Arabic RTL reference governs mirroring, Arabic copy, and readable currency values.
- Enlarged-text variants: Companion 200 percent reference governs wrapping, scrolling, and stacked tiles.
- Fidelity-affecting unknowns: None.
