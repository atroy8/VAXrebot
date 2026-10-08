# Node Face Sprites

AI-generated face sprite set for VAXrebot network nodes (branch
`assets-node-faces`, Oct 2026). Cute-but-professional flat vector style:
round colored face, thick dark outline, simple dot/curve eyes, small mouth.
Consistent art direction across all states; readable at 48-64px.

All frames are 128x128 PNG with transparent backgrounds. The game scales
them down to node size.

## Files (21)

| State       | idle.png | blink.png | reaction frame        |
|-------------|----------|-----------|-----------------------|
| healthy     | calm smile, dot eyes | eyes closed | `reaction.png`: contented (happy closed eyes) |
| exposed     | worried, amber | eyes closed | `cough.png`: mild cough, motion arcs |
| infected    | feverish, red, flushed cheeks | eyes closed | `cough.png`: hard cough, motion arcs |
| recovered   | relieved smile, teal | eyes closed | `happy.png`: joyful bounce, blush cheeks |
| vaccinated  | confident smile, purple | eyes closed | `happy.png`: joyful bounce, sparkles |
| quarantined | calm neutral, orange | eyes closed | `sleepy.png`: droopy eyelids, dozing |
| dead        | X-eyes, gray | X-eyes squeezed | `reaction.png`: X-eyes, tongue out |

Paths: `src/assets/faces/<state>/<frame>.png`, e.g.
`src/assets/faces/infected/cough.png`.

## Naming convention

- `idle.png`: default resting face for the state. Shown most of the time.
- `blink.png`: same face with eyes closed. Dead uses squeezed X-eyes.
- Third frame is state-specific and named by content: `cough.png`,
  `happy.png`, `sleepy.png`, or `reaction.png`.

## Suggested animation timings

- **Blink**: swap idle -> blink for ~150ms every 3-5s per node, with a
  random offset per node so the network does not blink in sync.
- **Cough** (infected, exposed): alternate idle/cough every ~400ms while
  the node is sick, or trigger the cough frame briefly on each simulation
  tick for that node.
- **Happy** (recovered, vaccinated): show for ~1s right after the
  vaccinating/recovering action lands on the node (scale bounce in code
  sells it). Then settle back to idle.
- **Sleepy** (quarantined): slow alternate between idle and sleepy every
  ~2s, or use sleepy as the resting frame for quarantined nodes.
- **Dead**: static `reaction.png` (X-eyes, tongue out) is fine; no
  animation needed. `idle.png`/`blink.png` exist for completeness.
- **Healthy reaction**: show briefly (~800ms) when a node resists
  infection or is protected by a neighboring vaccination.

## Notes

- Not yet integrated into game code (assets-only branch by design).
- Source generations were 1600x1600; finals were extracted by fitting the
  dark outline ellipse, cropped tight, and downscaled to 128x128.
- If a frame needs redoing, regenerate from the state idle with the same
  art direction and re-run the outline extraction.
