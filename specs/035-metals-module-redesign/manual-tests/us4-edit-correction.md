# US4 Edit Holding and Correction Manual Test Plan

Owner: Slice 7 US4. Source: FR-018–FR-021, FR-086, FR-088–FR-090; SC-003, SC-005, SC-010, SC-011, SC-015, SC-016, SC-021, SC-024, SC-026.

| ID | Journey | Expected observable result | Automation |
| --- | --- | --- | --- |
| US4-M01 | Edit active Gold name/Arabic notes only | Same full form saves directly, no reason, review route, financial action, or History correction. | UI, integration, Maestro |
| US4-M02 | Correct each active material fact, then combine with metadata | Locked Metal; inline saved/current values; required reason; only affected live consequences; one atomic local outcome and immutable History correction. | UI, integration, Maestro |
| US4-M03 | Change only Physical form | Exact previous/current form, unchanged current value/performance, image/description update, History consequence. | UI, preview, Maestro |
| US4-M04 | Restore all material fields, retain changed Name/Notes | Cues, reason, and summary disappear; ordinary Save preserves metadata. | UI, Maestro |
| US4-M05 | Open Sold/Disposed holding | Only name/notes editable; material facts and Metal remain immutable. | UI, integration |
| US4-M06 | Required reason missing, invalid facts, unusual facts, stale/offline rate, local writer failure | Focusable error/recovery; no partial records; valid local correction remains independent from network and reports sync state honestly. | UI, integration, manual device |
| US4-M07 | Replay/restart/stale concurrent correction | Same action replay is idempotent; whole-fact CAS accepts one action; loser is recovery-visible; no field merge. | integration |
| US4-M08 | EN/AR RTL, light/dark, compact/ordinary/tablet/landscape, 200% text, keyboard, screen reader, 3-button/gesture navigation | Shared order preserved; row stacks only when required; focus, labels, dirty exit and safe-area Save remain reachable. | UI plus manual device |

Manual device evidence must record build, fixture, locale/direction, theme, viewport/font scale, navigation mode, rate/network state, screenshots/video, result, and timing. Native assistive technology, orientation/tablet, gesture/3-button, keyboard, and actual human timing remain manual-only until controlled harness exists.
