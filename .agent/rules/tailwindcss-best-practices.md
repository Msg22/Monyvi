---
trigger: always_on
description: when working on mobile app that uses tailwindcss
---

- **CRITICAL: Prefer Tailwind CSS over StyleSheet.create** - Always use Tailwind
  classes (e.g., `className="flex-1 bg-slate-950"`) instead of
  `StyleSheet.create()` unless absolutely necessary for dynamic values or
  complex calculations. The theme colors defined in `tailwind.config.js` should
  be used as classes.
- **Exception: Shadow styles on interactive components** — `shadow-*`,
  `opacity-*`, and `bg-color/opacity` Tailwind classes on `TouchableOpacity` or
  `Pressable` cause a NativeWind v4 race condition crash ("Couldn't find a
  navigation context"). Use inline `style` props for shadow/elevation on these
  components instead. This is a known NativeWind v4 bug, not a workaround.
- Use Tailwind's JIT mode for faster builds and on-demand styles.
- Create custom utility classes for frequently used styles.
- Organize styles in a consistent manner to improve maintainability.
- For mobile responsiveness, use the **actual container and intrinsic label
  fit** before breakpoint utilities; do not force stacking or hide scalable
  financial text based only on screen width. Reserve 44/48 dp touch areas while
  keeping visual chrome compact. Follow `AGENTS.md`,
  `docs/design/design-system.md`, and `.agent/rules/styling-rules.md` for
  approved dark/RTL, keyboard and new page/modal feedback behavior.
