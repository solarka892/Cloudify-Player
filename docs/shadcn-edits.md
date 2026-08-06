# Hand edits to `src/components/ui/*`

CLAUDE.md says shadcn components are installed with the CLI and customised
through Tailwind classes and theme variables, not rewritten. That still holds —
but a few of the components as generated carry **literal** radii and shadows,
and a literal beats a custom property, so a skin cannot reach them. Those
literals have been replaced in place with the equivalent token.

This file exists because `pnpm dlx shadcn@latest add <name>` overwrites the file
it manages. **Re-adding any component listed here silently reverts these edits**,
and the symptom is subtle: the control keeps working and simply stops following
the skin. After re-adding, re-apply the change and run `pnpm lint` — the token
guard (`scripts/check-tokens.mjs`) fails on a literal `rounded-*` or `shadow-*`
in `src/`, so it will catch a reverted file before review does.

## `switch.tsx`

| Was | Now | Why |
| --- | --- | --- |
| `rounded-full` on the track | `rounded-[var(--radius-round)]` | The Obsidian skin takes `--radius-round` to `0`. A switch that stayed a capsule while every other control squared off was the one obviously unthemed control on the screen. |
| `rounded-full` on the thumb | `rounded-[var(--radius-round)]` | Same, and the two have to agree or the thumb is a circle in a rectangle. |
| `shadow-xs` on the track | *removed* | It was the only Tailwind-scale shadow left in `src/`, and there is no token it maps onto: `--shadow-1` is a card's drop shadow and far too heavy for a 1.15rem control. The track has a border and a fill, which is enough to read as a track — Obsidian has no shadows at all, and none of the other three skins look different without it. |

Nothing else in `src/components/ui/` has been touched.
