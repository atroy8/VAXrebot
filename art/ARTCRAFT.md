# Art plan: cloisonne citizens and a painted prologue

Goal: replace the emoji-style face balls and the simple SVG story cards with art
that matches the cloisonne planets and Japanese buildings, made in ArtCraft on
Adam's computer, then processed into the game by `npm run art:import`.

## 1. Style bible (applies to everything)

- **Cloisonne enamel**: thin raised gold wire outlines every shape, flat glossy
  enamel fills inside the wires, one soft highlight per shape, no gradients
  inside a cell beyond that highlight.
- **Palette**: Wada Sanzo pairs already used by the planets
  (`src/config/wada-palettes.js`). Gold wire `#d6b25e`, dark wire shadow
  `#3b2a12`, cream skin `#f6e3c4`.
- **Shapes**: round, chunky, friendly. Big heads, tiny bodies. No sharp
  spikes, no gore, no realistic sickness. Readable at 44 px.
- **Tone**: warm and hopeful even when sick. Death is quiet and gentle,
  never comic (no X eyes, no tongue out).
- **Never**: text or letters in images, real logos, real people, real brands,
  photographs, emoji.

## 2. People nodes: "citizens"

Each person in the web is a round enamel **charm token**: a gold wire ring with
a citizen's head and shoulders inside, on an enamel ground in the state colour.
The token shape keeps every tap target the same size and fits the existing
renderer (a square sprite over a sphere, see `src/ui/network-view-3d.js`).

### State readability (colour plus a shape cue, so colour-blind players can tell them apart)

| State | Ground colour | Face | Shape cue |
|---|---|---|---|
| healthy | jade `#8fd3a8` | calm smile | none (the plain baseline) |
| exposed | amber `#f9a62b` | worried brows | small sweat drop at the temple |
| infected | red `#da525d` | feverish, flushed | three darker enamel spots on cheeks and forehead |
| quarantined | orange `#f37420` | calm, eyes half closed | white cloth face mask |
| vaccinated | violet `#7c58b8` | confident smile | small gold shield badge on the shoulder |
| recovered | teal `#0093a5` | relieved grin | green leaf sprig tucked behind the ear |
| dead | grey `#a2b0ad` | eyes peacefully closed, faded enamel | small white chrysanthemum at the base |

### Frames (same names the game already loads)

`src/assets/faces/<state>/{idle,blink,<reaction>}.png`

| State | idle | blink | reaction file and content |
|---|---|---|---|
| healthy | yes | eyes closed | `reaction.png`: happy closed-eye smile |
| exposed | yes | eyes closed | `cough.png`: small cough, two tiny gold motion arcs |
| infected | yes | eyes closed | `cough.png`: harder cough, motion arcs |
| quarantined | yes | eyes closed | `sleepy.png`: dozing, head tilted |
| vaccinated | yes | eyes closed | `happy.png`: beaming, two gold sparkles |
| recovered | yes | eyes closed | `happy.png`: big joyful grin |
| dead | yes | same as idle | `reaction.png`: same, a single petal falling |

21 images. The blink and reaction frames must be the same citizen, same
framing, same ring: make idle first, then use it as the reference image for
the other two.

### Later (phase 2): one citizen look per planet

Same tokens, but the citizen's hair or hat changes per planet (Mizuho rice
farmer straw hat, Hanabi festival headband, Tsukimi moon-viewing hair pin,
Kumoji cloud-mountain hood, Sango coral hair beads, Yukimi snow hood, Hotaru
firefly lantern pin, Kaminari thunder drum headband). Only start once the
base set is approved in play.

## 3. Prologue: six painted medallions

Each story card gets one square painting framed as a round-cornered cloisonne
plaque. They replace the SVGs in `src/ui/prologue.js` card by card; any card
without a painting keeps its SVG.

| Card id | Painting |
|---|---|
| peace | A spiral galaxy of gold wire, with small jewel-like planets linked by thin golden star lanes, calm deep indigo sky |
| blight | Dark angular alien ships (purple-black enamel, red wire) drifting past a blue planet, releasing small red glowing spores |
| dark | Three planets, their city lights going out one by one, the nearest half in shadow, mood sad but not scary |
| hope | A small cream and gold response ship with a teal light flying along a dotted gold trail toward a green planet |
| tools | Three round enamel badges side by side: a vaccine (violet), a little house with a curved roof (orange), scissors cutting a thread (blue) |
| begin | The same galaxy as `peace`, now brighter and glowing, star lanes lit, a sense of a fresh start |

## 4. Generation settings in ArtCraft

- Model: a strong illustration model ArtCraft offers (start with GPT Image or
  Nano Banana; whichever keeps the gold wire crisp). Note which one you used
  in `art/inbox/NOTES.txt` so later batches match.
- Size: 1024 x 1024 (square) for everything.
- Background for citizens: **plain flat white** `#ffffff`, nothing else in the
  frame, token centred, about 8% margin all round. The import script cuts the
  token out by its ring, so a perfect background is not required, only a
  plain one.
- Background for prologue paintings: the painting fills the whole square.
- Reference images: `art/reference/citizen-guide.png` for the first healthy
  idle; after that, the approved healthy idle for every other state, so all
  21 tokens look like the same family.
- Make 3 or 4 variants per prompt and keep the best one.

## 4b. Vector route (what round 1 actually used)

The ArtCraft install on Adam's PC is the design suite (VectorCraft,
PhotoCraft, EffectCraft, PdfCraft), with no image-generation model, so the
first set is drawn as code-built vectors that follow this style bible:

- `art/source/citizens.mjs` and `art/source/prologue.mjs` draw every frame.
- `npm run art:draw` writes editable SVGs to `art/source/svg/` and 1024 px
  PNGs into `art/inbox/`, then `npm run art:import` takes over as below.
- To hand-refine one: open its SVG in VectorCraft, export a 1024 px PNG with
  a white background (paintings fill the square) under the inbox name, and
  re-run `npm run art:import`.

## 5. Workflow

1. Generate in ArtCraft with the prompts in `art/prompts/`.
2. Save the picks into `art/inbox/` with these names:
   - citizens: `faces-<state>-<frame>.png`, for example `faces-infected-cough.png`
   - prologue: `prologue-<cardId>.png`, for example `prologue-peace.png`
3. Run `npm run art:import`. It cuts out each token, centres it, trims to the
   ring, writes 192 px PNGs to `src/assets/faces/`, writes 640 px WebP
   paintings to `src/assets/prologue/`, and prints a contact sheet to
   `art/out/contact-sheet.png` plus a report of anything it rejected.
4. Check the contact sheet, then play level 1 in the browser.
5. Commit on a branch; Adam playtests before merging.

## 6. Acceptance checks

- Every state reads at 44 px (contact sheet shows each token at 44 px too).
- All 21 face files exist, are square, transparent outside the ring, 192 px.
- Prologue paintings are at most 160 kB each; the entry bundle stays under
  300 kB gzipped (paintings load only when the story plays).
- No console errors; level 1 playthrough lands every tap at 390x844.
