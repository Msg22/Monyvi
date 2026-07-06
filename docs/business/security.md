# Security Notes

## Dependency Audit Scope

Monyvi treats dependency audit findings in two buckets:

1. **Runtime/mobile bundle risk**: dependencies that can execute in the shipped
   Expo/React Native app or in production Supabase/runtime code. High or
   critical findings in this bucket block v1 release until fixed or explicitly
   accepted by Mohamed.
2. **Dev/build-chain risk**: dependencies used by local tooling, tests,
   generators, bundlers, or CI build steps. High or critical findings in this
   bucket are still tracked, but remediation may be separated from runtime fixes
   when the safe fix requires breaking toolchain upgrades.

Use these checks when triaging npm audit findings:

```bash
npm audit --audit-level=high
npm audit --omit=dev --audit-level=high
```

Do not run `npm audit fix --force` without a dedicated upgrade plan and
validation pass. Forced fixes can downgrade or jump major versions of Expo,
WatermelonDB, or other core mobile dependencies.
