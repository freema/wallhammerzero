# spike-a/staff

- **Reads at 1x:** A person with a head half the body, the apron's dark hem, the walk's leg alternation and the arm swing; the work pose by its clipboard (down), its reach (side) or its nod (up).
- **Deviations from the brief:** Work has 2 frames, not 2–3: a third frame was identical to the first for two facings (the kit's `timing` warning). Idle bobs by a squash (the head and torso drop, legs shorten), not a lift: the tallest pose is the rest pose, so the outline never enters the margin. Arms hold in work; a raised 2 px arm collides with the head at this size.
- **Open issues:** The clipboard reads as a white apron at 1x; the side face has one 2 x 2 eye and no mouth, which is the Kairosoft read but little expression. Red hair on a red shirt was a mush: the rig turns such hair brown.
- **Passes:** 8 lint passes on the rig (orphan pixels at the arm/torso overlap, the outline's concave corners, the hair's mid-tone pocket, the shadow pixel between the feet; `fits-frame` for the outline under the feet; `timing` for identical work frames), 1 visual pass on the strips.
- **Rough time:** ~90 min, most of it the shared rig (`spike-lib/chibi.ts`) that every other character reuses.
