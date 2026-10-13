# new-hope/kit-street

- **Reads at 4x:** Dark wet asphalt with a raised concrete kerb one voxel wide on every exposed side, a yellow lane dash on the low lateral edge of the travel axis (`axis`) when that edge is open, and from the seed a puddle of dark glass, sometimes with a pink or cyan neon reflection. Preset `road-x` (kerbs on both long sides) and `lane-x` / `lane-z` (no kerb, the dash) show it as a piece of road.
- **Reads at 1x:** A dark slab; the dash and the puddle are 2 to 4 px.
- **Open issues:** Alone with all sides exposed (the default the note asks for) it is a kerb ring around a 2 x 2 dip, which looks like a box, not a road. In the kit sheet it reads as a street.
- **Passes:** 1 (plus the layout rule in kit.ts: beyond the layout's edge a street goes on, no kerb).
- **Rough time:** ~10 min.
