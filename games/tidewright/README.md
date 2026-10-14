# Tidewright

Sail a 9 m sloop through a generated archipelago and deliver cargo between harbours before the
weather turns (D32, the first game made by `/make-game`; the pitch is in
[docs/games/pitches.md](../../docs/games/pitches.md)).

- **The verb:** steer and trim the sail against a shifting wind. Upwind you tack, downwind you
  run; the angle to the wind and the trim of the sheet decide the speed.
- **The hook:** a Gerstner-wave ocean with foam, and a sail-and-keel force model at real scale.
- **Real scale:** the boat is 9 m long with a 12 m mast, waves are a metre or two, islands are
  hundreds of metres across, harbours are a few minutes of sailing apart.
- **The ceiling:** no people seen up close, no combat.

The game is the package [packages/tidewright-play](../../packages/tidewright-play/README.md):
`./dev compose up tidewright`, then http://127.0.0.1:4300. Where it stands: [STATE.md](STATE.md).
