# Language and direction consistency

Issue: https://github.com/Msg22/Monyvi/issues/345

English must settle into LTR and Arabic into RTL before normal content is usable.
Authenticated profile language is authoritative; otherwise use the device override,
device locale, then English. Translation equality never proves native direction equality.
Persist explicit selection before reload. One automatic reload per unresolved scoped
target prevents loops. Stale account work must not affect a new account.

User revised failure behavior: direction-only failures allow normal account access once
the existing authentication/profile safety gates are satisfied. Show one existing warning
toast per failed attempt: “Your language change couldn’t finish. Please close and reopen
the app.” Never require logout. Persistence/translation failures show the existing language
change error and retain the usable runtime. No dedicated recovery screen.

No schema, financial behavior, supported-language, or ordinary-screen redesign changes.

The earlier blocking recovery draft was superseded by the explicit nonblocking warning decision.
