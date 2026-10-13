# new-hope/kit-solid-market

- **Reads at 4x:** At `storey` 0 a shopfront: a lit display behind a steel counter, a striped awning (red, paint, Union or plant colours from the seed) and a neon sign on a dark backing whose columns light top, bottom or both, so it reads as writing. Above the shops (`storey` >= 1): flats with a vertical neon sign on the left pier of some faces. Every cell picks its own sign colour, so a row of cells reads as a row of shops.
- **Clips:** `lit` (one frame) and `flicker` (4 frames: on 1400 ms, dim 70, on 140, dark 90). The two neons with a dim slot (pink, cyan) dim; the others go dark.
- **Reads at 1x:** A band of neon over warm light at the foot of a tower; the strongest module at game size.
- **Passes:** 2 (flush windows; the sign glyph changed from 3 of 4 voxels lit, which read as a solid bar).
- **Lint:** 3 timing warnings for the preset `mid-storey` in the facing `nw`: that preset exposes only +x and +z, which nw does not see, so the flicker frames are identical there. Expected.
- **Rough time:** ~15 min.
