# Contract: Global Budget Carousel

## Purpose

Render every healthy active global budget as complete equal-sized cards, grouped
into responsive pages with deterministic recovery after data or width changes.

## Layout function

```ts
export const GLOBAL_BUDGET_MIN_CARD_WIDTH = 320;
export const GLOBAL_BUDGET_CARD_GAP = 16;
```

```ts
interface CalculateCarouselLayoutInput {
  readonly containerWidth: number;
  readonly gap: typeof GLOBAL_BUDGET_CARD_GAP;
  readonly minimumCardWidth: typeof GLOBAL_BUDGET_MIN_CARD_WIDTH;
  readonly itemCount: number;
}

interface CarouselLayout {
  readonly visibleCardCount: number;
  readonly cardWidth: number;
  readonly pageCount: number;
}
```

Rules:

- reject or safely defer layout when container width is not positive;
- `visibleCardCount = max(1, floor((containerWidth + gap) / (minimumCardWidth + gap)))`,
  capped at item count when item count is positive;
- `cardWidth = (containerWidth - gap * (visibleCardCount - 1)) / visibleCardCount`;
- when `0 < containerWidth < 320`, one card uses the full container width;
- `pageCount = ceil(itemCount / visibleCardCount)`;
- every page uses the same card width, including an incomplete final page;
- no adjacent page/card is intentionally revealed;
- dots render only when `pageCount > 1`.

The 320 dp minimum and 16 dp gap are named design constants derived from the
approved phone mockup. The minimum controls when another card may be added; it
does not force overflow on narrower containers. The final page preserves card
width and leaves unused space.

## Page grouping

```ts
function groupGlobalBudgets(
  budgets: readonly BudgetDashboardItem[],
  visibleCardCount: number
): readonly GlobalBudgetPage[];
```

- Preserve read-model order.
- Do not mutate input arrays.
- Page keys derive from stable member budget IDs.
- Every input budget appears once.

## Regrouping

```ts
function resolveCarouselPage(
  pages: readonly GlobalBudgetPage[],
  firstVisibleBudgetId: string | null
): number;
```

- If the ID remains eligible, return its containing page.
- If missing/null, return 0.
- Clamp programmatic scrolls to a valid index.
- Width/filter/lifecycle changes must not leave a stale out-of-range offset.
- If a change occurs during momentum, the newest layout/data generation wins.

## Accessibility and interaction

- Carousel has an accessible label describing Overall budgets.
- Each card visibly renders and announces identity, period, spent amount, limit,
  percentage, remaining amount, remaining time, and lifecycle.
- User-driven page changes announce translated “Page X of Y” with
  `AccessibilityInfo.announceForAccessibility`.
- Programmatic initial layout does not emit a noisy announcement.
- Page indicators are informational and not tiny tap targets.
- Logical data order remains the same in LTR and RTL; gesture/visual direction
  follows platform conventions.
- Reduced motion disables decorative transitions and avoids forced animated
  recovery.

## Test matrix

At minimum cover:

- non-positive width, 319/320 dp single-card behavior, and the 655/656 dp
  transition to two 320 dp cards;
- one, two, three, and uneven page groups;
- final page with fewer cards;
- rotation/resizing;
- eligible anchor retained and removed;
- filter/lifecycle update during gesture;
- RTL and font scaling;
- dots hidden/shown;
- page announcement behavior.
