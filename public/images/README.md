# Photography

Drop Chrissy's own photographs here. Files are picked up automatically — any
that are missing fall back to a styled placeholder panel, so the site never
breaks while it waits for them.

| Filename | Where it appears | Crop |
|---|---|---|
| `logo.jpg` | Chrissy's Instagram profile mark — the source of the site palette | Square (already added) |
| `hero.jpg` | Full-bleed homepage hero | Landscape, ~2000px wide |
| `work-01.jpg` … `work-06.jpg` | Portfolio grid | 4:5 portrait |

Labels and captions for the portfolio grid live in `lib/seed.js` under `gallery`.

Keep files under ~400KB each — these load before anything else the client sees.

## Palette source

`logo.jpg` is where the site's colours come from. Sampled from it:

| Sampled | Hex | Used as |
|---|---|---|
| Logo ground | `#b99a7b` | `--taupe`, the brand tone |
| Cream letterforms | `#fdf7ef` | `--on-primary`, type on dark grounds |
| Blonde hair midtone | `#dccbb6` | `--surface-elevated` |
| Crown / script gold | `#dcc189` → `#8a6d3a` | the signature stripe and `--gold` |

If the logo is ever redrawn, re-sample it and update the token block at the top
of `public/css/app.css` — every colour on the site derives from there.
