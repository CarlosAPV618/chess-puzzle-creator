# Chess Puzzle Creator Pro — logo

## Concept
A geometric knight (chess) whose straight back edge grows a jigsaw tab (puzzle):
your own games become puzzle pieces. One silhouette, one colour, readable at 16 px.

## Files
- `public/icons/icon.svg` — master mark (256 grid, rounded tile r=56). Source of truth.
- `public/icons/icon-192.png`, `icon-512.png` — `purpose: any` (transparent corners).
- `public/icons/maskable-512.png` — full-bleed green, mark at 60% (inside the 80% safe zone).
- `public/icons/apple-touch-icon.png` — 180x180, full-bleed green, mark at 78%.
- `public/favicon.ico` — 16/32/48 from `icon.svg`.
- `src/components/logo.tsx` — `LogoMark` (inline SVG, aria-hidden) and `Logo` (mark + wordmark).

Regenerate rasters with `.claude/skills/logo-design/scripts/render_png.py` (uses headless Chrome).

## Colours
| Role | Token | Hex |
|---|---|---|
| Tile / accent | `--color-brand` | `#7fb24a` |
| Knight / ink | `--color-ink` | `#0d1310` |
| "Pro" badge text | `--color-brand-strong` | `#96c95c` |
| Wordmark text | `--color-fg` | `#eef2ec` |

## Wordmark
Geist Sans bold, tight tracking: "Chess **Puzzle** Creator" with "Puzzle" in brand green,
followed by a small outlined uppercase "PRO" badge. The mark itself is name-agnostic.

## Do
- Keep the mark on its green tile; min size 16 px (mark), 120 px wide (full lockup).
- Clear space around the mark = the tab's diameter (~18% of the tile).
- Use `Logo` in headers, `LogoMark` alone in tight spots (tabs, avatars, loaders).

## Don't
- Recolour the knight, add gradients/shadows/outlines, or rotate/mirror it.
- Put the knight without the tile on mid-green or busy backgrounds.
- Retype the wordmark in another font or drop the "Puzzle" accent.
