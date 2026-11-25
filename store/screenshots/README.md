# Screenshots

Made by `npm run store:screenshots` (see the header of `scripts/store-screenshots.mjs`). They are real: the script plays the built game and saves what is on screen, with the iPhone safe area simulated. Nothing is drawn on top, and there is no status bar (Apple does not need one).

| Folder | Size | Upload under |
| --- | --- | --- |
| `6.9-inch/` | 1320 x 2868 | iPhone 6.9 inch display (needed) |
| `6.5-inch/` | 1284 x 2778 | iPhone 6.5 inch display (optional) |

Upload in number order. The first three are what people see in search results.

| File | What it shows | Caption, if you add text banners later |
| --- | --- | --- |
| `01-title.jpg` | The title planet | Save the galaxy, one outbreak at a time |
| `02-star-map.jpg` | The star map with progress | 80 puzzles across 8 planets |
| `03-outbreak.jpg` | A level on day 2, red lines showing where it spreads next | Cut the red lines before nightfall |
| `04-masks.jpg` | A festival on the fourth planet, two people masked | New tools on later planets: masks and tests |
| `05-results.jpg` | A win, the stars and Dr. Diallo | Three stars, and nobody lost |
| `06-daily.jpg` | The Daily puzzle briefing | A new Daily puzzle every day |

The files are JPEG to keep the repo small. App Store Connect takes JPEG and PNG. For PNG run `STORE_FORMAT=png npm run store:screenshots`.

Each run plays fresh games, so the people and the webs differ from run to run.
