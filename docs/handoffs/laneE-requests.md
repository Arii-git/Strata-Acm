# Lane E (a11y) requests to other owners

1. **Lane A, `components/shell/AppShell.tsx`**: remove the old `<a href="#main" className="skip-link">Skip to content</a>`. The global skip link now sits in `app/layout.tsx` (`SkipLink` from `components/ui/states.tsx`). `a11y.css` hides the old one (`.skip-link:not(.skip-link--global)`), so this is cleanup only. Keep `<main id="main" tabIndex={-1}>`: the skip link targets it.
2. **Landing owner, `app/page.tsx`**: add `id="main"` to `<main className="landing__main">`. `SkipLink` falls back to the first `<main>`, so this is for the no-JS path.
3. **Lead, `components/ui/index.ts`**: export the new helpers from the barrel:
   `export { EmptyState, ErrorState, Loading, LiveRegion, SkipLink, announce, type Politeness } from "./states";`
   `export { chartOptionToTable, ChartA11yContext, type ChartTable } from "./echarts";`
   Until then, import them from `@/components/ui/states`.
4. **Lead, `PageTemplate.tsx`**: the Explain button uses `btn--sm`. `a11y.css` lifts every `.btn--sm` to 44 px, so no change is needed. Optional: give `MetricGroup`'s `<section>` `aria-labelledby` pointing at its `<h2>` instead of repeating the text in `aria-label`.
5. **Lead, `TermHint.tsx`**: the 20 px "?" button gets a 44 px hit area from CSS (`.term-hint__btn::after`). Please also give the popover `role="tooltip"` or `role="dialog"`, and close it on Esc if it does not already.
6. **Lane A, sidebar at narrow widths**: at 640 CSS px (1280 px at 200 % zoom) the 248 px sidebar leaves about 390 px for content. There is no horizontal scroll now, but please collapse the sidebar automatically below 760 px.
7. **All page lanes**: after any async action (approve, reject, reset, save), call `announce("Plan approved. 3 workflow tasks created.")` (or `announce(msg, "assertive")` for failures), and pass `next="…"` to `EmptyState`/`ErrorState` so the user knows what to do.
