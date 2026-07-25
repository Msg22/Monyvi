# SMS Scan Safeguards Launch Readiness Evidence

This file separates completed implementation from evidence that requires a real
provider console, release configuration, emulator, or physical Android device.
Do not mark a gate complete without recording the date, environment, tester, and
privacy-safe result. Never record SMS bodies, financial values, credentials,
project references, or provider keys.

## Current Status

- Implementation and deterministic automated coverage: complete.
- Provider-console and release-operations verification: pending.
- Full emulator and physical-device evidence: pending.
- Final visual, accessibility, and diagnostics privacy evidence: pending.

These pending gates block launch enablement, not code review or merge of the
implemented safeguards.

## Provider And Incident Controls

- [ ] Confirm Gemini project budget alerts are enabled below the accepted
      monthly exposure.
- [ ] Confirm alerts notify the release on-call maintainer and backup
      maintainer.
- [ ] Disable `SMS_FULL_PARSER_ENABLED` in the release project, invoke
      `parse-sms` with an authenticated QA account, and confirm refusal occurs
      before provider execution and Gemini invocation count does not increase.
- [ ] Restore `SMS_FULL_PARSER_ENABLED` only after the refusal evidence is
      recorded.
- [ ] Repeat the disable/refusal/restore check for
      `SMS_CATEGORY_ENRICHMENT_ENABLED` and `enrich-sms-categories`.
- [ ] Link the privacy-safe release evidence or incident ticket here: `Pending`.

## Deterministic Profile Repetition

For every profile in `manual-device-qa.md`:

- [ ] Run twice after the documented profile reset on an emulator.
- [ ] Run twice using the supported physical-device command when the profile has
      an honest device-visible path.
- [ ] Confirm aggregate results are identical across both runs.
- [ ] Confirm production provider calls and production allowance charges remain
      zero.
- [ ] Record profile IDs, commands, pass/fail status, and privacy-safe aggregate
      diagnostics in the PR or release issue.

Evidence link: `Pending`.

## Visual And Accessibility Verification

- [ ] Compare the approved structure in light and dark themes.
- [ ] Verify English and Arabic, including RTL ordering and localized absolute
      availability time.
- [ ] Verify increased font scale without clipped actions or unreadable
      warnings.
- [ ] Verify Android status-bar and navigation-bar safe areas on emulator and a
      physical device.
- [ ] Verify disabled rescan accessibility state.
- [ ] Verify sticky review header/footer and the QA panel never overlap content.
- [ ] Attach privacy-safe comparison images to the PR or release issue.

Evidence link: `Pending`.

## Full Manual QA And Privacy Audit

- [ ] Execute every required manual scenario in `quickstart.md` on an emulator.
- [ ] Execute every device-applicable scenario on a physical Android device.
- [ ] Record pass/fail evidence and any honest harness limitation.
- [ ] Verify release, disabled, and malformed QA configurations render no QA
      panel.
- [ ] Search diagnostic props, translations, accessibility labels, structured
      logs, screenshots, and recorded evidence for raw SMS bodies or financial
      values.
- [ ] Confirm only aggregate counts, profile metadata, boundaries, reason codes,
      and privacy-safe identifiers are present.

Evidence link: `Pending`.

## Sign-Off

- Release owner: `Pending`.
- Verification date: `Pending`.
- Launch decision: `Blocked until every checkbox above is complete`.
