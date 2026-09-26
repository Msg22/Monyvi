# Implementation plan

Use a plain mobile language coordinator with immutable resolving/applying/restarting/
ready/error snapshots, a platform direction adapter, and React subscription facades.
Resolve authentication before applying device direction. Observe profile language as
an immutable primitive; route selection entry points and startup through the coordinator.
Serialize applications and cancel stale scope work. Persist profile then device override
before reload. Store a scoped restart-attempt marker; explicit selection may retry a failed attempt.
Native uses allowRTL, forceRTL, and Expo reloadAppAsync. Web updates document direction.
Keep startup/profile recovery reachable. Let direction failure settle with a nonblocking
warning using the existing Toast component after hiding splash and satisfying account gates.

Delivery: red regressions; lead contract checkpoint; core implementation; startup integration;
focused tests/type/lint; native development/release verification and PR matrix.
