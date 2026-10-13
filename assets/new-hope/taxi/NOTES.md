# new-hope/taxi

- **Reads at 4x:** A yellow (`paint`) hover car, 1 x 2 tiles: a long bonnet with two cold
  white headlights, a cabin of two window rows set back with the windscreen leaning back, a
  short boot with pink tail lights, a lit yellow taxi sign on the roof, a neon underglow along
  the skirt and a pool of its dim light on the ground (solid, checkered at its rim). The facing
  reads in all four: the white lights and the long bonnet point the way, the pink lights mark
  the tail.
- **Reads at 1x:** A yellow car over a magenta glow.
- **Clips:** `idle` 4 frames (400/300/400/300 ms): down, up, up, down, a bob of one voxel
  (2 px); the underglow is bright on the first pair and dim on the second, so no two
  neighbours are equal. `fly` 4 x 160 ms, held one voxel up: the underglow pulses every
  frame, the tail lights blink every other pair.
- **Deviations from the brief:** Warm headlights (`light-warm`) disappeared into the yellow
  body; they are `light-cold`. The underglow's pool on the ground is the contact shadow
  recoloured, so it stays put while the car bobs (that is what shows the hover).
- **Open issues:** The pool is large (a voxel beyond the skirt all round); in a dense scene it
  may read as a carpet. `glow` param: pink (default) or cyan; `off-duty` turns the sign off.
- **Passes:** 2 (the first cabin was one window row under a slab of roof: a cake, not a car).
- **Rough time:** ~20 min with the rig in `new-hope-lib/vehicles.ts`.
