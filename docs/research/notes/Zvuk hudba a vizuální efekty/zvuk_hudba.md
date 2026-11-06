# Audio for Wallhammer Zero: runtime engine, SFX, music and AI generation (path A procedural vs B AI-generated vs hybrid)

Research date: 2026-11-05. Context: C17, SDL3 (D5 says audio comes from SDL3), macOS M4 Pro primary, Linux and Windows for tests. Generic engine (D15) with two reference scenes: a GTA-like dense city and a Light No Fire-like planet. Quality bar GTA III / WoW (D13). Visual content comes from code, and textures may come from a one-time AI image with provenance (D14). The owner has not decided the audio source yet.

**Source quality note.** Fetched in full or in part: the miniaudio manual and GitHub README, the SDL3 wiki audio category, the Steam Audio site and GitHub, the SoLoud homepage, both engine-sim repos, the ElevenLabs Sound Effects docs and the Stable Audio Open 1.0 model card. Everything else came from search-result summaries, which are secondary. That covers Steam AI disclosure (I did not get Valve's own text), Suno/Udio licensing, loudness standards, granular engine sound, the No Man's Sky talk and Spore. I could not fetch the Paul Weir GDC talk content (GDC Vault, paywalled video) or Andy Farnell's book. Claims from my background knowledge that I did not verify in this session sit only under **Inferences** or **Gaps** and are marked *(unverified)*.

Local precedent: the old voxel-musou web prototype baked all audio procedurally at startup through `OfflineAudioContext`. It had a formant voice synth (sawtooth + 4 band-pass formants + aspiration), layered impacts (click/crack/thump/sub-drop), taiko/chords/power-chord loops with equal-power crossfade, and a noise-IR convolution reverb. Its runtime chain was sfx/vox/bed buses → 5-band EQ → compressor (25 ms attack) → tanh soft-clip. It used sidechain ducking on each hit tick, swing sounds leading the hitbox by 7–12 frames, and a cap of 56 voices. It also used `Math.random`, so it was not deterministic. See `wallhammerzero/docs/research/notes/Reference repa/voxel-musou.md` §4.8.

---

## 1. Runtime audio engine in C: SDL3 vs miniaudio vs SoLoud / OpenAL Soft / Steam Audio (FMOD/Wwise as comparison)

### Takeaway
Use SDL3 for device I/O (keeps D5) and miniaudio (public domain / MIT-0, single C file) as the mixer, node graph, decoder and basic 3D spatializer. SDL3 has streams and mixing but no 3D. miniaudio's `ma_engine` can run with no device, so SDL3 can pull it in a stream callback, and headless tests can render it offline. Write our own voice manager, occlusion approximation, reverb zones and ducking on top. Steam Audio (Apache-2.0, C API) stays an optional later add-on for HRTF, occlusion and reflections.

### Cited Findings
**SDL3 audio**
- "All audio in SDL3 revolves around SDL_AudioStream." Streams convert format, sample rate and channel layout. A device "will pull it from all bound streams and mix them together for playback." Logical devices migrate transparently when the default output changes. — [SDL3 wiki, CategoryAudio](https://wiki.libsdl.org/SDL3/CategoryAudio)
- SDL3 offers per-stream get/put callbacks (`SDL_SetAudioStreamGetCallback`), device and stream gain, a frequency ratio (`SDL_SetAudioStreamFrequencyRatio`), and layouts from mono to 7.1. The audio category page mentions no positional/3D audio. — [SDL3 wiki, CategoryAudio](https://wiki.libsdl.org/SDL3/CategoryAudio)

**miniaudio**
- License: "Your choice of either public domain or MIT No Attribution." It is a "single source file", and "written in C with no dependencies except the standard library." — [mackron/miniaudio README](https://github.com/mackron/miniaudio)
- Features: a "High-level API for sound management, mixing, effects and optional 3D spatialization", a "Flexible node graph system", a resource manager, WAV/FLAC/MP3 decoding plus custom decoders, resampling and channel mapping. — [miniaudio README](https://github.com/mackron/miniaudio)
- Backends: Core Audio; WASAPI, DirectSound and WinMM; ALSA, PulseAudio, JACK, sndio and OSS; AAudio/OpenSL; Web Audio; null; and **custom backends**. — [miniaudio manual](https://miniaud.io/docs/manual/index.html)
- `ma_engine` wraps the resource manager and the node graph. It can be created with `noDevice`, and several engines can share one resource manager. — [miniaudio manual](https://miniaud.io/docs/manual/index.html)
- `ma_sound` has volume, pan, pitch, fades, start/stop scheduled in PCM frames or ms, looping and an end callback. The end callback runs on the audio thread. One `ma_sound` is one playing instance. — [miniaudio manual](https://miniaud.io/docs/manual/index.html)
- Sound groups act as buses with their own volume and effect chain; the manual's example is sfx, voice and music. Sounds and groups are nodes and can attach to effect nodes. All graph data is f32. — [miniaudio manual](https://miniaud.io/docs/manual/index.html)
- Spatialization: listener position, direction, up and cone; per-sound position, direction, cone, **velocity for Doppler** and a doppler factor; attenuation models none, inverse (= `AL_INVERSE_DISTANCE_CLAMPED`, the default), linear and exponential; rolloff, min/max gain and min/max distance; multiple listeners. "HRTF and environmental occlusion are not currently supported, but planned for the future." — [miniaudio manual](https://miniaud.io/docs/manual/index.html)
- Streaming: "When streaming sounds, 2 seconds worth of audio data is stored in memory", as 1-second pages with two pages per instance. Streaming is recommended for music. Async loading uses `MA_SOUND_FLAG_ASYNC` with fences/callbacks. `jobThreadCount = 0` lets the application run the jobs itself. A custom VFS is supported. — [miniaudio manual](https://miniaud.io/docs/manual/index.html)
- Filters: biquad (transposed direct form 2), LPF/HPF orders 1–8 (Butterworth), BPF (even orders), notch, peaking EQ, and low/high shelf. — [miniaudio manual §11](https://miniaud.io/docs/manual/index.html)
- Thread safety: "Only ma_node_graph_read_pcm_frames() is expected to be lock-free." Attach/detach uses spinlocks, and the resource-manager job queue "is not 100% lock-free and will use a spinlock". Ring buffers are thread safe only for a single producer and a single consumer. Never start or stop the device from inside the callback. — [miniaudio manual](https://miniaud.io/docs/manual/index.html)
- The manual excerpts I read mention no reverb node and no voice-limit or virtual-voice facility. — [miniaudio manual](https://miniaud.io/docs/manual/index.html), [README](https://github.com/mackron/miniaudio) ("Basic effects and filters")

**SoLoud**
- ZLib/LibPNG license; C/C++ with a "pure 'C' version of the whole API". It has mixing buses, **virtual voices**, 3D positional audio, filters (LP/HP, echo…), an sfxr-style SFX synthesizer, a speech synthesizer, gapless looping, and WAV/Ogg/MP3. The page's copyright reads 2013–2020. — [SoLoud homepage](https://solhsa.com/soloud/)

**Steam Audio**
- Apache-2.0, version 4.8.1 per the README. Platforms: Windows, Linux, macOS, Android and iOS. — [ValveSoftware/steam-audio](https://github.com/ValveSoftware/steam-audio)
- Features: HRTF binaural rendering, occlusion against scene geometry, reflections, and realtime or baked propagation for static scenes. Integrations: C API, Unity, Unreal, FMOD Studio and Wwise. — [Steam Audio site](https://valvesoftware.github.io/steam-audio/)

**Ducking precedent**
- voxel-musou: sidechain ducking on each hit tick; buses → EQ → compressor → tanh soft-clip; cap of 56 voices. — local note `Reference repa/voxel-musou.md` §4.8

### Inferences
- **Recommended layering:** keep SDL3 as the only device layer, as D5 requires. Run `ma_engine` with `noDevice` and pull frames from it in `SDL_SetAudioStreamGetCallback`. The same engine can run in headless mode (D17) and render N seconds to a buffer or WAV with no audio hardware. That gives us golden-audio tests and agent analysis. Alternatively, use miniaudio's own Core Audio/WASAPI backends and drop SDL audio; that is simpler, but it splits D5. Both work; the noDevice route is cleaner for headless use.
- **Why not SDL3 alone:** it would mean writing the decoder, resampler (SDL streams do resample), spatializer, filters and graph ourselves. miniaudio gives all of these as one C file under a permissive license. Claude-written C code would replicate it at higher risk.
- **Why not SoLoud:** it is C++ inside with a C wrapper, which fits D4 (C++ only behind a C adapter), and it has virtual voices and sfxr built in. But its site looks unmaintained since about 2020, and miniaudio is pure C and actively developed (manual © 2026). We can take SoLoud's voice-management idea and write our own.
- **OpenAL Soft** *(unverified: LGPL-2.0, HRTF, EFX reverb)*: LGPL would force dynamic linking, and its API is state-machine style. Not recommended.
- **FMOD/Wwise** *(unverified: proprietary, free indie tiers under revenue/budget thresholds, C++ SDKs, authoring tools)*: they are the industry reference for buses, snapshots, virtual voices, RTPCs, interactive music and "states/switches". They are not suitable because the license is not ours, the tools are GUI-based (bad for AI authoring), and they conflict with "everything in the project folder" (D6). Use them only as a conceptual checklist.
- **Our own layer above miniaudio (`eng_audio`):**
  - *Voice manager.* Use a fixed pool of real voices, e.g. 64–96, preallocated `ma_sound` objects (no attach/detach during play, which avoids the spinlocks). Above it sits an unlimited pool of **virtual voices**: emitters tracked by position, priority and audibility estimate, with no DSP. Each tick, sort by `priority × estimated loudness at listener` and promote or demote. Add per-category caps, e.g. max 12 car engines, 8 footsteps, 6 horns, 1 police siren per type. Add instance limits with steal policies (oldest, quietest, reject new). Add a minimum time between repeats of the same event. A dense city easily has hundreds of emitters, so virtualisation is mandatory.
  - *Distance and Doppler:* use miniaudio's spatializer. Doppler is per-sound via velocity, needed for cars. Clamp the doppler factor to avoid warble on teleports and camera cuts.
  - *Occlusion/obstruction:* cheap approximation. Cast 1–3 rays from listener to emitter on the job system at 10–20 Hz, then smooth a per-voice low-pass cutoff plus gain. "Through wall" means LPF about 800 Hz and −12 dB; "around corner" means mild LPF. For the city, use cell/portal or room IDs from the world data (interior vs street).
  - *Reverb zones:* miniaudio has no reverb. Write one (Freeverb/FDN-style, or convolution with procedurally generated noise IRs as in voxel-musou) as a custom node on 2–4 send buses: street, tunnel, interior and open field. Blend sends by listener zone weights (box/volume triggers, or cell metadata such as street-canyon width and height). Wet amount can also depend on per-emitter distance.
  - *Buses:* master → {music, sfx(world → vehicles/peds/weapons/ambience), ui, voice/radio}. Ducking: a side-chain from a "priority" bus (dialogue, big explosions, the hit tick à la voxel-musou) drives gain on music/ambience with attack/release envelopes. It can be done as a control-rate envelope rather than true audio-rate sidechain. Mixer snapshots (pause, underwater, interior, slow-mo) are tables of bus gains/filters lerped over time.
  - *Thread model:* the game thread writes commands (play/stop/set param, listener update) into an SPSC lock-free ring. The audio callback (SDL/miniaudio thread) drains it at the start of each block. The callback never allocates or locks; graph wiring changes happen only at init. Decoding and streaming jobs run on the engine job system (`jobThreadCount=0`) or a dedicated IO thread via SDL_AsyncIO. Feedback (voice finished, levels for metering) comes back on a second SPSC ring.
  - *Latency:* a 256–512 frame buffer at 48 kHz (5–11 ms) is plenty for games. Schedule "lead" sounds as voxel-musou did (swing sound 7–12 frames before the hitbox) using sample-accurate scheduled start times.
  - *Determinism:* audio must never feed back into simulation. Variation RNG is seeded per event (event id + emitter id), so headless renders reproduce bit-identically on the same platform. This fixes voxel-musou's `Math.random`.
- **Steam Audio, later and optional:** HRTF is only valuable for headphone players. Occlusion and reflections give real quality in tunnels and interiors, but cost scene-geometry export and CPU, and baking conflicts with streamed procedural cells. Evaluate it after the basic stack, behind a port such as `eng_audio_spatial` so it can be swapped in.

### Gaps
- I did not verify miniaudio's exact latest version or release date, `MA_ENGINE_MAX_LISTENERS`, or whether an extras reverb node exists in the repo (*unverified recollection*: there is an `extras/nodes` folder with a reverb node). Check the repo before deciding.
- Steam Audio macOS arm64 support and the C API header were not confirmed on the fetched pages.
- I did not fetch the SDL_mixer 3 status, or current FMOD/Wwise license terms and thresholds.

---

## 2. Procedural SFX from code: synthesis approaches and realistic quality

### Takeaway
Code synthesis is excellent for stylised UI/feedback sounds, wind/rain/water/fire beds, creature voices and simple impacts. It is also viable for car engines if a physically informed model is used. It is weak for "recorded realism": footsteps on specific surfaces, glass, crowds, city walla. GTA III-level realism for those is easier from samples (recorded or AI-generated) varied by code. Car engine sound in games has historically been crossfaded RPM/load loops or granular, not pure synthesis.

### Cited Findings
- **engine-sim (AngeTheGreat):** "real-time internal combustion engine simulation … designed specifically to produce engine audio and simulate engine response characteristics." It is MIT-licensed, Windows-only build ("this project currently only builds on Windows!"), and depends on SDL2, Boost, Flex/Bison and CMake. It is "NOT a scientific tool", and development has moved to a community-edition repo. — [ange-yaghi/engine-sim](https://github.com/ange-yaghi/engine-sim)
- The community edition repo contains only release zips and docs. It calls itself "the free version of Engine Simulator by AngeTheGreat", and its controls include a "Convolution Level" (the exhaust/IR stage). — [Engine-Simulator/engine-sim-community-edition](https://github.com/Engine-Simulator/engine-sim-community-edition)
- **Game car engines in practice**, per a search-result summary across these sources:
  - Crossfaded RPM loops (idle plus several RPM loops, pitch-shifted, with separate on-load/off-load layers) are "the most widely used".
  - Racing-game sound sets can exceed a hundred WAV files per car.
  - Granular approaches analyse recordings offline (engine-cycle detection for grain boundaries) so the runtime stays cheap. Their weak point is holding a steady RPM, and interpolation "can sound pretty synthetic".
  - Tools: AudioMotors (pitch-synchronous, load on/off), Wwise REV, and Unity VNS (clips per RPM and load).
  
  Sources: [Designing Sound 2014, Project CARS/Forza 5/REV](https://designingsound.org/2014/08/11/vehicle-engine-design-project-cars-forza-motorsport-5-and-rev/), [Audiokinetic: Engine sound modeling, sampling to granular](https://www.audiokinetic.com/engine-sound-modeling-from-sampling-to-granular-synthesis-in-wwise), [Designing Sound AudioMotors review 2013](https://designingsound.org/2013/04/audiomotors-review/), [VehicleNoiseSynthesizer](https://www.Github.com/ATG-Simulator/VehicleNoiseSynthesizer). The sources date from 2013–2014; current practice was not confirmed.
- **No Man's Sky** used physically modelled synthesis for creature voices. Paul Weir's GDC 2017 talk covers "the reasons for the procedural audio experiments" and building **VocAlien**, "a physically modeled vocal tract synthesis plugin". — [GDC Vault: The Sound of No Man's Sky](https://gdcvault.com/play/1024067/The-Sound-of-No-Man)
- **SoLoud** ships an sfxr-style generator and a speech synthesizer, so stylised synthesis in-engine is an established pattern. — [SoLoud](https://solhsa.com/soloud/)
- **voxel-musou** (our own precedent) produced usable formant voices (kiai shouts, grunts, cries) and layered impacts entirely in code. — local note §4.8

### Inferences
- **Technique per sound class** (synthesis background is mostly from Andy Farnell, *Designing Sound*, MIT Press 2010 *(unverified in this session)*, and sfxr/jsfxr/ChipTone conventions):
  - *UI/feedback:* sfxr-style generators (square/saw/noise oscillators, pitch slide, ADSR, arpeggio, LPF/HPF, phaser). They are a perfect fit: tiny, consistent palette, parametric. Path A.
  - *Wind:* filtered noise with slowly modulated band-pass. Gusts come from low-frequency noise driving gain and cutoff. Add whistle resonances near edges and obstacles. Parameters: wind speed, gustiness, shelter. Path A at good quality (Farnell-style).
  - *Rain:* a dense noise bed plus granular droplet "ticks" (short filtered clicks with random pitch) per surface (leaf, metal, puddle). Density scales with intensity. Path A is reasonable; a hybrid with an AI-generated bed is better in the city.
  - *Water, fire, thunder:* Farnell-style recipes are good-to-acceptable. Thunder works as noise bursts plus long LPF-reverb tails.
  - *Impacts/collisions:* modal synthesis (a bank of damped sinusoids whose frequencies and decays come from material and size) plus a noise transient. It is good for wood, metal and plastic with physics-driven parameters (impulse, mass), and weaker for glass shatter and debris, where granular sample layers are better.
  - *Footsteps:* synthesis (noise bursts shaped per surface: gravel granular crunch, snow LPF crunch, metal modal ring) is recognisable but "gamey". AI or recorded samples with round-robin and code variation sound better. Hybrid.
  - *Creatures (planet):* a formant/vocal-tract synth à la VocAlien and voxel-musou, with parameters from creature size and species seed. This is a natural fit for procedural creatures: every species gets a unique voice. Path A is the strongest argument here.
  - *Cars:* three options.
    1. Port the engine-sim ideas (cylinder firing pulses with firing order, exhaust pipe as delay lines/waveguide, convolution with an exhaust/body IR, RPM and throttle/load as inputs). It is MIT, but a Windows/C++/Boost codebase, so treat it as reference, not a dependency. CPU cost per car is unknown, so use it only for the player car plus 2–3 nearest, with cheaper models for traffic.
    2. Generate RPM-bin loops offline (from engine-sim-like synthesis or AI generation) and crossfade them at runtime like classic racing games. Cheap per voice, good for traffic.
    3. Granular from one long generated ramp.
    
    Recommendation: a hybrid where an offline-generated loop set per engine archetype (I4, V8, scooter, truck, EV whine), with on/off load layers, serves the traffic voices. The player car optionally uses a live synth layer.
  - *Ambience beds (city):* walla/crowd, distant traffic rumble and air conditioners are hard to synthesise convincingly. Traffic rumble is fine from LPF noise plus a low-frequency engine-chord mix; crowds are not. AI-generated loops (path B) plus code-placed spot emitters (birds, dogs, sirens, AC hum) work better.
- **Quality ceiling vs GTA III / WoW** *(GTA III and WoW used recorded samples, background knowledge)*:
  - Pure code gets UI, wind and weather, creatures and sci-fi elements to that level or above.
  - Footsteps, glass, crowds and voices with words fall clearly below with pure synthesis.
  - Cars reach acceptable with crossfaded synthetic loops, and very good with an engine-sim-class model.
- **Bake vs live:** most synthesised SFX should be baked offline (at asset build or first run, cached by hash per D8) into PCM banks, as voxel-musou did. Only parameter-continuous sources run live: wind, rain density, engines, creature calls with per-instance variation. This keeps audio-thread CPU predictable.

### Gaps
- No primary measurement of engine-sim's CPU cost per instance, or whether its core is separable from the app. Its language and structure were not visible on the fetched page.
- Farnell's book, sfxr's parameter set and modal-synthesis papers were not fetched in this session. The technique descriptions above come from background knowledge.
- No sources on how the shipped GTA titles produce vehicle and city audio (no primary talk found or fetched).

---

## 3. Procedural/adaptive music: NMS Pulse, Spore, interactive-music concepts, code-composed music

### Takeaway
The proven pattern for an endless procedural world is NMS's Pulse: humans (65daysofstatic) composed a library of musical fragments, and a rule system assembles them into endless, state-driven "soundscapes". Spore's Pure Data system shows a fully generative score, but needed Eno-level curation, and its makers felt it was only partly used. For us, the engine needs a stem/fragment player with horizontal resequencing, vertical layering and state-driven transitions. Where the fragments come from (code-composed, AI-generated, or human-made) is a separate, swappable content decision.

### Cited Findings
- **Pulse (NMS):** Weir built Pulse to assemble musical elements into "soundscapes", dynamically generated variations of the score. 65daysofstatic wrote the core album and produced the components Pulse draws on. Because Weir's tool was not available to them, they mocked it up with off-the-shelf tools and built their own prototype to his specification. — search summary of [MusicRadar](https://musicradar.com/news/guitars/how-65daysofstatic-built-the-soundtrack-to-no-mans-skys-infinite-universe-641184), [FACT](https://factmag.com/2016/08/13/no-mans-sky-65daysofstatic-soundtrack), [Louder](https://www.loudersound.com/features/how-65daysofstatic-ended-up-creating-no-man-s-sky-s-soundtrack); talk listing at [GDC Vault 1024067](https://gdcvault.com/play/1024067/The-Sound-of-No-Man)
- **Spore:** Kent Jolly and Aaron McLeran presented the procedural music at GDC 2008. It was built in a customised Pure Data called **EApd**. Eno spent a week with the team, and a key step was "teaching the system to filter notes into scales and modes, so that it started to sound like music instead of noise". CDM called it "a truly generative musical score". Its makers said the game used "only a fraction of the potential" of the engine. — [archive.org GDC2008Jolly](https://archive.org/details/GDC2008Jolly), [PdCon: Using Pure Data in Spore and Darkspore](https://www.uni-weimar.de/kunst-und-gestaltung/wiki/PDCON:Conference/Using_Pure_Data_in_Spore_and_Darkspore), [GameSpy Eno interview (mirror)](https://moredarkthanshark.org/eno_int_gspy-feb08.html), [CDM 2009](https://cdm.link/2009/04/09/gdc-music-video-games-and-interactivity-chat-with-boing-boing-video/)
- **voxel-musou** made taiko, chord and power-chord loops in code with equal-power crossfade loops. — local note §4.8

### Inferences
- **Engine features needed** *(industry concepts from Wwise/FMOD interactive music, background knowledge)*:
  1. *Tempo/bar clock:* a sample-accurate musical clock on the audio thread. Transitions are quantised to beat, bar or custom markers.
  2. *Horizontal resequencing:* segments/fragments with entry and exit cues, plus a transition matrix (from state X to state Y via bridge segment Z, on the next bar).
  3. *Vertical layering:* stems (pad, rhythm, melody, percussion) faded by RTPC-like parameters (danger, speed, time of day, biome).
  4. *Stingers:* one-shots aligned to the beat.
  5. *Rule-based generator (Pulse-like):* picks fragments from weighted pools with constraints (key, tempo, density, no repeats within N minutes), seeded by world position or planet seed, so a place always "sounds like itself".
- **Radio (city):** GTA-style radio is a different system from adaptive score. It needs N "stations": long linear playlists that keep advancing virtually even when the player is not listening, plus DJ/ad interstitials, played through a "car radio" filter when heard from outside cars. Engine-wise this is easy: one streaming voice and a virtual clock per station. The content is the hard part: dozens of minutes of finished songs per station. Code-composed songs are unlikely to reach "radio" quality. That is where AI music (section 4) or human-made or licensed music is the realistic source.
- **Code-composed music quality ceiling:** a sequencer plus our own synths (chiptune, as in our earlier experience and the `code-pixel-game` skill's chiptune sequencer) can produce stylistically coherent chiptune, ambient, drone and simple electronic music. Spore and NMS show generative ambient can be good when the fragment material and harmonic rules are curated. Code-composed music falls short at expressive, produced genres (rock/pop/hip-hop radio, orchestral realism), because that needs sample-based instruments and mixing craft. For the planet, ambient generative from code is a credible target. For the city radio it is not.
- **Hybrid music design:** the engine-side music system is source-agnostic. A "fragment" is a PCM stem plus metadata (key, tempo, bars, intensity, tags). Fragments come from:
  - (a) offline-rendered code compositions, which are deterministic and seeded;
  - (b) AI-generated clips cut and analysed by code (key and tempo detection, bar slicing, loop seams);
  - (c) future human contributions.
  
  This is the Pulse division of labour, with the "composer" role filled by code or AI.

### Gaps
- I could not access the Weir GDC 2017 talk itself: the GDC Vault video, slides and its specifics on Pulse rules and instrument metadata. Details of Pulse's internal rules remain unsourced.
- Spore's EApd patch details and CPU cost were not obtained.

---

## 4. AI audio generation in 2026: models, licensing, Steam disclosure, provenance, post-processing

### Takeaway
SFX models are mature enough for one-time generation of source assets. ElevenLabs SFX v3 is the newest at ≤30 s and 48 kHz WAV, with seamless loops; v2 is deprecated and will be removed on 1 March 2027. Stable Audio Open 1.0 is open weights trained on CC audio, good at SFX and field recordings and weak at music. Music models are legally unstable in 2026: Udio became a closed "walled garden" after the label settlements, while Suno pays out commercial rights on paid plans as it moves to licensed models. Steam (Jan 2026) requires disclosing pre-generated AI content that players consume, which includes audio. That is manageable, but it must be tracked per asset.

### Cited Findings
**ElevenLabs Sound Effects**
- Models: `eleven_text_to_sound_v3` (newer, better at multi-part prompts, music and vocals) and `eleven_text_to_sound_v2` (default but deprecated, "will be removed on March 1, 2027"). Duration 0.1–30 s, seamless looping, MP3, and WAV 48 kHz for non-looping effects. 40 credits per second when duration is set. Prompt influence is adjustable. The docs page makes no commercial-use statement. — [ElevenLabs docs: Sound effects](https://elevenlabs.io/docs/product/sound-effects/overview)
- When launched, v2 added clips up to 30 s, seamless looping and 48 kHz. — [The Decoder](https://the-decoder.com/elevenlabs-releases-version-2-of-its-ai-sound-effects-model-with-longer-clips-and-better-audio-quality/)
- Commercial terms (secondary, conflicting): one blog (May 2026) says commercial use needs a paid Starter plan or higher, and that the Prohibited Use Policy bars selling or redistributing SFX outputs on their own, while embedding in games and videos appears fine. Another site says outputs are royalty-free. A marketplace listing claims training on a licensed Shutterstock library. — [Classmethod blog](https://dev.classmethod.jp/articles/elevenlabs-sound-effects-web-ui-trial/), [ScriptByAI](https://www.scriptbyai.com/elevenlabs-sound-effect)

**Stable Audio Open 1.0**
- Stability AI Community License ("For commercial use, please refer to stability.ai/license"). Variable length up to 47 s, stereo, 44.1 kHz. Trained on about 486k recordings (472,618 from Freesound, 13,874 from the Free Music Archive), all CC0, CC BY or CC Sampling+. Limits: no realistic vocals, English prompts, uneven across music styles, "better at sound effects and field recordings than at music". — [HF model card](https://huggingface.co/stabilityai/stable-audio-open-1.0)

**Suno/Udio** (secondary sources, provisional)
- UMG–Udio settlement in Oct 2025 restricted Udio downloads, with a brief download window. — [AP via Yahoo](https://www.yahoo.com/news/articles/ai-song-generator-udio-offers-132621881.html)
- Warner settled with Suno in Nov 2025; Suno is to launch licensed models. — [SiliconANGLE](https://siliconangle.com/?p=722896)
- Udio is reported as having no audio/stem downloads on any plan as of Sept 2026. Suno Pro includes commercial rights and downloads, while the free tier carries no commercial rights. Sony claims reportedly remain open. — [Dubspot](https://blog.dubspot.com/suno-udio-ai-music-lawsuits-2026), [AI Law Wiki](https://ailawwiki.com/News_Major_Labels_Settle_Suno_Udio_2026), [Dupple](https://dupple.com/learn/suno-vs-udio)
- An analyst argues that post-settlement licences do not retroactively clear tracks from older models. — [Sonilo](https://sonilo.com/blog/comparisons/udio-v4-warner-music-licensing-explained)

**Steam AI disclosure**
- On 16 Jan 2026 Valve updated the Content Survey. Disclosure now focuses on AI content "consumed by players"; efficiency tools (e.g. code assistants) are exempt. The survey splits **pre-generated** content (held to the same rules as non-AI content) from **live-generated** content (developers must describe guardrails). An overlay lets players report illegal AI content. — [PC Gamer](https://www.pcgamer.com/software/ai/steam-updates-ai-disclosure-form-to-specify-that-its-focused-on-ai-generated-content-that-is-consumed-by-players-not-efficiency-tools-used-behind-the-scenes/), [Gigazine](https://gigazine.net/gsc_news/en/20260120-steam-updates-ai-disclosure-guidelines), [Notebookcheck](https://www.notebookcheck.net/Steam-updates-AI-disclosure-form-requiring-developers-to-report-visible-and-in-game-AI-but-not-background-tools.1206103.0.html). Valve's own page was not fetched.

**Loudness targets** (for post-processing)
- Sony ASWG-R001 sets −23 LUFS ±2 LU average for console (PS3) and −18 LUFS for the handheld Vita, with true peak ≤ −1 dBTP and loudness range ≤ 20 LU. — [Designing Sound: interview with Garry Taylor](https://designingsound.org/2012/07/30/video-games-and-loudness-standards-interview-with-sonys-garry-taylor/), [Designing Sound 2013](https://designingsound.org/2013/02/20/different-loudness-ranges-for-console-and-mobile-games)
- Other guidance gives −24 LUFS for console (e.g. Wii U) and −16 LUFS for mobile/handheld. — [IESD Mix Ref Levels](https://www.audiogang.org/wp-content/uploads/2015/04/IESD-Mix-Ref-Levels-v03.02.pdf), [Audiokinetic loudness series](https://audiokinetic.com/loudness-processing-best-practices-series-chapter1-loudness-measurement-part1)

### Inferences
- **Mirror D14 for audio (proposed "D14-audio"):** each sound asset declares a source: `proc` (generator + params + seed) or `ai` (model id and version, prompt, seed if exposed, duration, loop flag, date, plan/terms snapshot, raw file hash). The raw AI output is committed as the source asset. Code processing always follows:
  - trim and fade;
  - DC removal;
  - EBU R128 normalisation per category target;
  - true-peak limiting;
  - loop-seam fix (crossfade loop at a zero-crossing or matched phase, or rely on the model's loop flag and verify it);
  - resample to 48 kHz;
  - mono for 3D emitters;
  - slicing of variation sets.
  
  Runtime variety comes from code: pitch ±3–8 %, filter jitter, layer recombination and round-robin. Both sources go through the same lints and A/B review.
- **Steam disclosure:** one-time AI SFX or music is "pre-generated" content, so it must be declared on the store page. Live-generated content (an AI model at runtime) is not planned. A provenance manifest makes the disclosure answerable per asset. Procedural code audio needs no disclosure.
- **Model choice per category:**
  - *SFX:* ElevenLabs v3 for quality and loops, about 30 s max. Generate long ambiences in 30 s looped chunks and assemble them in code. Pin the model_id, since v2 dies on 1 Mar 2027 and regeneration will not reproduce the same output. That is another reason to commit the raw outputs.
  - *Open alternative:* Stable Audio Open 1.0, which runs locally and is trained on CC audio. It has better provenance optics, but check the Community License revenue threshold *(unverified recollection: free under US$1M annual revenue)* and the CC BY attribution question.
  - *Music:* the highest legal risk. Suno paid tiers give commercial rights, but the label litigation (Sony) is unresolved. Udio cannot export. Prefer code-composed or human music, or treat AI music as a placeholder until licensing settles.
- **Consistency across a set:** AI generators drift between prompts. Mitigations:
  - generate many candidates per slot from one prompt template (fixed style tokens), then select by analysis (spectral centroid, loudness, duration) and owner review;
  - post-process the whole set with the same EQ/compression chain, a "sonic palette" that is the audio analogue of D14's palette remap;
  - shared reverb comes from the runtime, not baked in, so ask models for "dry, close-mic, no reverb".

### Gaps
- I did not read ElevenLabs' official Terms of Service or Prohibited Use Policy, the Stability license page (revenue threshold), Suno's current terms, or Valve's own Steamworks text. All licensing statements above come from docs pages that omit terms, or from secondary sources.
- Not researched: Stable Audio 2.x/2.5 (commercial API), Meta AudioCraft/AudioGen (*unverified*: weights under CC-BY-NC, which would block commercial use), Google Lyria / Lyria RealTime, MMAudio, Tango, other open SFX models.
- No independent quality benchmark (e.g. listening tests) comparing ElevenLabs v3 vs Stable Audio Open for game SFX.

---

## 5. How AI agents can author and judge audio without ears

### Takeaway
Agents can enforce objective quality through deterministic analysis: loudness (BS.1770/R128 LUFS, true peak, LRA), clipping, DC offset, silence, loop seam continuity, and spectral descriptors against per-category bounds. They can "look" at spectrogram PNGs. Aesthetic judgement must go to the owner through a blind A/B listening page. The headless offline render (miniaudio `noDevice`) makes in-engine mixes inspectable the same way.

### Cited Findings
- Loudness specs to lint against: −23 LUFS ±2 LU average, −1 dBTP true peak, LRA ≤ 20 LU (ASWG). — [Designing Sound / Garry Taylor](https://designingsound.org/2012/07/30/video-games-and-loudness-standards-interview-with-sonys-garry-taylor/)
- Loudness measurement methodology (K-weighting, gating) as used in game middleware. — [Audiokinetic loudness series ch.1](https://audiokinetic.com/loudness-processing-best-practices-series-chapter1-loudness-measurement-part1)
- miniaudio can run without a device and expose `ma_node_graph_read_pcm_frames` / engine reads, so offline rendering for analysis is possible. — [miniaudio manual](https://miniaud.io/docs/manual/index.html)
- ElevenLabs' `loop` flag produces sounds "with no audible start or end point". This claim should be verified automatically rather than trusted. — [ElevenLabs docs](https://elevenlabs.io/docs/product/sound-effects/overview)

### Inferences
- **Audio lints (`tools/audio_lint`, C or Python in `.tools/`):**
  - Integrated LUFS within the category target ±1 LU. Suggested targets: SFX one-shots measured as short-term max; ambience loops −30 to −24 LUFS; music stems −23 LUFS for the full mix.
  - True peak ≤ −1 dBTP; no samples at ±1.0 (no clipping); |DC offset| < 0.001.
  - Head silence < 5 ms for one-shots (latency); tail fades to −60 dBFS.
  - Loop seam: sample discontinuity at the wrap below a threshold, and spectral flux across the seam ≈ median flux of the file.
  - Sample rate and channel count per category (3D emitters mono).
  - Duration bounds; spectral centroid/bandwidth within per-category ranges, so a "footstep" with energy mostly above 8 kHz is flagged.
  - Near-duplicate detection inside a variation set (too-similar variants waste memory; too-different ones break consistency).
  - Implementation *(unverified tool facts)*: libebur128 (MIT, C) for R128, or ffmpeg's `ebur128`/`loudnorm` filters in the tooling. Both fit D6 if vendored in `.tools/`/`external/`.
- **Seeing audio:** render log-mel spectrogram and waveform PNGs per asset and per engine capture. Claude can inspect images (onsets, tails, noise floor, seam discontinuities, frequency balance). Engine-side debug counters, exposed over the D17/D18 debug and MCP server: active/virtual voice counts, per-bus peak/LUFS meters, steal events, the occlusion value per voice, the reverb zone weights, and the music state/segment.
- **Golden tests:** a headless scenario such as "car drives past at 80 km/h, then enters tunnel" renders to WAV. Check the Doppler pitch curve, LPF on occlusion and reverb tail length numerically against expected envelopes, and diff against a stored golden within tolerance on the same platform.
- **Semantic checks** *(unverified)*: CLAP-style audio-text embedding models could score "does this sound match its prompt or category". They are useful to rank AI candidates, not as ground truth.
- **Owner A/B listening page:** a static HTML page (fits the D18 studio review) with a blind A/B/X between candidates or old vs new mix, loop playback with a visible seam marker, a spectrogram, ratings stored to a JSON file, and the decision written back to the provenance manifest. The owner is the art director (Roles in DECISIONS.md), so audio approval is theirs, as for visuals.

### Gaps
- No sources fetched on CLAP or other learned audio-quality metrics. Their reliability for game SFX is unknown.
- No published practice found of "AI agents judging game audio". This section is design inference.

---

## 6. Proposal: module layout, milestones, path A/B/hybrid per category, open decisions

### Takeaway
Build a source-agnostic audio runtime: `eng_audio` on SDL3 device + miniaudio graph, with our own virtual voices, occlusion, reverb sends, ducking and music clock. Add an offline `eng_gen_audio` generator library whose outputs are cached by hash, as D8 does, and an `ai`-source import path with provenance, as D14 does. Default recommendation per category is hybrid: code for UI, wind/weather, creatures and engine models; AI samples plus code variation for footsteps, impacts with realistic texture, and city ambience beds; music via a Pulse-style fragment system whose content source the owner picks.

### Cited Findings
- Building blocks and their licences: miniaudio (public domain / MIT-0, C) — [README](https://github.com/mackron/miniaudio); SDL3 audio streams — [SDL wiki](https://wiki.libsdl.org/SDL3/CategoryAudio); Steam Audio (Apache-2.0, C API) — [GitHub](https://github.com/ValveSoftware/steam-audio), [site](https://valvesoftware.github.io/steam-audio/); engine-sim (MIT, reference only) — [GitHub](https://github.com/ange-yaghi/engine-sim)
- Precedents: Pulse fragment assembly (NMS) — [GDC Vault](https://gdcvault.com/play/1024067/The-Sound-of-No-Man); VocAlien vocal-tract synthesis (NMS) — same; voxel-musou offline bake + runtime bus graph — local note §4.8

### Inferences
**Module layout** (C17 targets, per D7 layering; identifiers in English):
- `eng_audio_device`: SDL3 device and stream; the get-callback pulls frames from the mixer; null device for headless.
- `eng_audio`: the mixer core wrapping miniaudio. Contents:
  - bus graph and snapshots;
  - voice pool, virtual voices and priorities;
  - emitters and listener (position from the world; doubles or cell-relative floats per D15 coordinates, converted to listener-relative floats before passing to miniaudio);
  - Doppler;
  - occlusion port (ray queries supplied by the physics/world layer through an interface);
  - reverb send buses plus zone blending;
  - ducking/sidechain;
  - command SPSC ring;
  - streaming through the engine IO/job system;
  - metering;
  - offline render API for tests.
- `eng_audio_dsp`: our own nodes: FDN/Freeverb reverb, convolution (IRs generated by code), compressor/limiter, soft-clip, granular player, crossfaded RPM-loop player.
- `eng_audio_synth`: live synth voices: wind, rain density, engine model, creature formant/vocal-tract. Shares code with the generators.
- `eng_gen_audio` (offline, tools/asset build): generator programs + params + seed → PCM. Covers sfxr-like UI, modal impacts, footstep synth, ambience layers, music fragment rendering from a sequencer, IR generation. Outputs are cached by hash (D8) and processed by the same post-chain as AI assets.
- `eng_audio_import`: AI or external WAV import, provenance manifest, the post-processing chain (R128, trim, loop fix, mono, slicing) and variation-set builder.
- `eng_music`: musical clock, segment/stem player, transition matrix, layering parameters, Pulse-style rule picker seeded per region/planet, radio stations with virtual playheads.
- `tools/audio_lint` + `tools/audio_review`: lints, spectrogram PNG, A/B HTML page, MCP endpoints (D18): `audio.render_scenario`, `audio.lint`, `audio.meters`.
- Data: `audio_events` table (event → sound set, category, priority, cap, steal policy, attenuation curve, bus, variation rules) as plain text data, so Claude can author it. Per-project style bible audio section: palette EQ chain, loudness targets, category targets.

**Milestones** (relative; align to the actual milestone plan):
1. *First playable / city block:* `eng_audio_device` + `eng_audio` basics (buses, 3D with Doppler, voice pool with virtual voices and caps, command ring, offline render) + `audio_lint` + a few `eng_gen_audio` UI and impact generators + car engine as crossfaded generated RPM loops + one ambience bed + headless golden test.
2. *City density:* traffic voice budgeting, occlusion rays, reverb zones (street, tunnel, interior), ducking and snapshots, footstep sets per surface, radio station skeleton, AI import pipeline if the owner approves path B.
3. *Planet seed:* wind/rain/weather synth driven by the weather system, creature voice synth, Pulse-style `eng_music` with biome/time-of-day layering.
4. *Later:* live engine-model synth for the player car, Steam Audio evaluation (HRTF, geometric occlusion), more music content.

**Recommended path per category:**

| Category | Recommendation | Why |
|---|---|---|
| UI / HUD / feedback | **A** (sfxr-style, offline baked) | Consistent palette, tiny, fully parametric; quality ceiling is not an issue for stylised UI |
| Footsteps | **Hybrid**: B samples per surface (dry, many variants) + code variation; A synth fallback for exotic surfaces | Synth footsteps sound "gamey"; GTA III bar implies sample-like texture |
| Impacts / physics hits | **Hybrid**: A modal synth driven by physics for generic props; B layers for glass/debris | Modal fits physics parameters; shatter is hard to synthesise |
| Cars (engines) | **A/hybrid**: generated RPM×load loop sets per engine archetype (synth like engine-sim, or AI ramps sliced by code); later live model for the player car | Proven loop-crossfade runtime; synthesis gives unlimited archetypes |
| Cars (tyres, horns, sirens, doors) | Horns and sirens **A** (simple oscillators are realistic for these); tyres and doors **B** | |
| City ambience beds (walla, traffic rumble, AC) | **B** loops (ElevenLabs loop flag) + A spot emitters | Crowds are hard to synthesise |
| Planet wind / rain / weather | **A** live synth | Parameter-continuous, Farnell-style recipes work well |
| Creatures | **A** formant/vocal-tract synth seeded by species | Matches procedural creatures; NMS VocAlien precedent; voxel-musou experience |
| Music: adaptive planet score | **A** code-composed fragments in a Pulse-style system (B optional) | Generative ambient is within code's ceiling |
| Music: city radio | **Open**: B (Suno paid, legal risk), human/licensed, or code-composed (below radio quality) | Content quality vs licensing trade-off |
| Voices / dialogue | Out of scope here (TTS is a separate topic) | |

**Open decisions for the owner:**
1. Path B for audio at all (a D14 analogue): allow one-time AI SFX with committed raw outputs and a provenance manifest, accepting a Steam "pre-generated AI content" disclosure? If not, footsteps, crowds and some ambience will sound stylised.
2. Which SFX model: ElevenLabs (cloud, paid plan, terms need checking) vs Stable Audio Open (local, CC-trained, Community License)?
3. Music source for city radio: accept AI music legal risk, use human or licensed music, or accept code-composed "stylised radio"?
4. Device layer: SDL3 device + miniaudio `noDevice` (recommended, keeps D5) vs miniaudio's own backends.
5. Is HRTF/geometric acoustics (Steam Audio) a goal, or are stylised occlusion and reverb zones enough for the GTA III/WoW bar?
6. Loudness target for the full game mix (−23 vs −24 LUFS integrated; desktop PC has no platform mandate) and the per-category targets.
7. Audio style: realistic-ish samples vs a deliberately stylised "sound palette" that matches the stylised visuals (D12/D13). This decides how much path A is acceptable everywhere.

### Gaps
- The milestone numbering of the actual project plan was not available. Placement above is relative.
- No CPU budget measurements for miniaudio voice counts on M4 Pro, or for live synth voices. These need a measurement once the analysis phase ends (D11 forbids prototypes now).
