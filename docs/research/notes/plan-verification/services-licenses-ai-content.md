# Plan verification: services, licenses and AI content

Research date: 2026-11-06. Researcher: Claude (subagent). I read all links today unless stated otherwise.

I am not a lawyer. This is an overview of sources, not legal advice. Before releasing the game, it is worth having a lawyer review items 1, 2, 4 and 8.

## Short conclusion

The plan holds. None of the eight assumptions is refuted, but three have a gap that needs closing.
Steam wants disclosure of AI content that the player sees and hears (graphics, audio, text, localization). The form is silent about code, so for "graphics from code written by AI" it is unclear whether we must report.
ElevenLabs explicitly allows sound effects in games, commercially only on a paid plan. The model version can be chosen, but not permanently: model v2 is switched off on 1 March 2027 and the API has no seed, so the output cannot be repeated.
Caution about AI music is still in order. Sony and UMG are still suing Suno and no fair use ruling has come yet.
Pure AI output is not protected by copyright in the USA or in Czechia. Only the human contribution (selection, arrangement, edits) is protected, and that is decided case by case.
It makes sense to store C2PA, and the `c2patool` tool exists and is maintained. But it must not be a requirement, because some models do not embed the metadata.
From the EU AI Act, no labeling obligation follows for a game publisher with pre-generated stylized content.
All libraries are usable in a closed commercial game. We only need to include the license texts and one sentence about FreeType.

## Table of items 1–8

| # | Item | Status | What exactly holds | Link |
|---|-----|------|-----------------|-------|
| 1a | Steam: obligation to disclose AI content | CONFIRMED | The Content Survey has a section on AI. It divides content into Pre-Generated (created during development) and Live-Generated (created while the game runs). You must describe how the game uses AI. For Live-Generated you must also describe safeguards against illegal content. Valve judges AI content the same as other content. | [Steamworks: Content Survey](https://partner.steamgames.com/doc/gettingstarted/contentsurvey) (primary) |
| 1b | Steam: change in 2025–2026 | CONFIRMED | In January 2026 Valve edited the text. It now says that tools for development efficiency "are not the focus of this section". It concerns content that is part of the game and that the player consumes: "artwork, sound, narrative, localization, etc." The obligation did not disappear, it only narrowed. | [Steamworks: Content Survey](https://partner.steamgames.com/doc/gettingstarted/contentsurvey) (primary), [GamingOnLinux 17 Jan 2026](https://gamingonlinux.com/2026/01/valve-tweak-steam-ai-disclosure-form-for-developers-to-clarify-its-for-content-consumed-by-players) (secondary) |
| 1c | Steam: does this also apply to code written by AI? | UNCERTAIN | The page does not mention code at all. By its text, editor helpers are not the target. But our case is different: AI wrote code that draws graphics that the player sees. This can be read as "AI used in creating artwork". Valve does not address it anywhere. | [Steamworks: Content Survey](https://partner.steamgames.com/doc/gettingstarted/contentsurvey) (primary) |
| 2a | ElevenLabs SFX: commercial use in a game | CONFIRMED | The terms explicitly allow embedding the output in "films, trailers, advertising, video, games, applications". Commercially only where the plan allows it. According to the Terms of Use, the Free plan is non-commercial only. The commercial license starts with the Starter plan (6 USD/month). The output stays with the user ("you retain all rights in and to your Output"). | [ElevenCreative Terms, Exhibit 4](https://elevenlabs.io/sound-effects-terms), [Terms of Use §1(c), §4(c)](https://elevenlabs.io/terms-of-use) (both primary, version from 9 Oct 2026), [pricing](https://elevenlabs.io/pricing) |
| 2b | ElevenLabs SFX: restrictions | CONFIRMED | The audio may be distributed only combined with other material. It must not be sold or distributed separately, as isolated files or as a sound library. ElevenLabs gives no guarantee that the output does not infringe others' rights, and does not indemnify. Another user may get a similar output. ElevenLabs may use outputs for training, which can be turned off in the account. | [ElevenCreative Terms, Exhibit 4 §2](https://elevenlabs.io/sound-effects-terms), [Terms of Use §4(d), §4(i), §9, §10](https://elevenlabs.io/terms-of-use) |
| 2c | ElevenLabs: pinning the model version | PARTLY | The API has a `model_id` parameter with values `eleven_text_to_sound_v2` (default) and `eleven_text_to_sound_v3`. Model v2 is marked as deprecated and will be removed on 1 March 2027. A seed parameter does not exist. The same prompt therefore does not give the same sound. | [API reference](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert), [model overview](https://elevenlabs.io/docs/overview/models), [SFX documentation](https://elevenlabs.io/docs/overview/capabilities/sound-effects) (primary) |
| 3 | AI music: is caution in order? | CONFIRMED | UMG settled with Udio (29 Oct 2025), Warner with Udio (19 Nov 2025) and with Suno (25 Nov 2025). Sony settled with nobody. UMG and Sony are still suing Suno and filed a second lawsuit on 18 Sep 2026. No fair use ruling has come. The Munich court ruled against Suno on 31 Jul 2026 in the dispute with GEMA. | [AI Lawsuit Tracker](https://ailawsuittracker.com/cases/umg-v-suno/), [Wikipedia: Suno](https://en.wikipedia.org/wiki/Suno_(platform)) (both secondary) |
| 4a | US copyright | CONFIRMED | Copyright Office, January 2025: purely AI material is not protected. Prompts alone are not enough. Protected are human expression that is visible in the output, creative selection and arrangement, and creative edits. Using AI as an aid does not harm protection. It is judged case by case. The Supreme Court on 2 Mar 2026 declined the Thaler case, the human author requirement still stands. | [Report Part 2, p. iii](https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-2-Copyrightability-Report.pdf) (primary), [Mayer Brown on Thaler](https://www.mayerbrown.com/en/insights/publications/2026/03/supreme%20court%20denies%20review%20in%20ai%20authorship%20case) (secondary) |
| 4b | EU and Czech copyright | CONFIRMED, no uniform rule | The EU has no special regulation on AI outputs. The general standard applies, "the author's own intellectual creation", meaning of a human. A study for the European Parliament (7/2025): a fully machine output is not protected, a work with AI as an aid may be. The Municipal Court in Prague (10 C 13/2023): an AI image is not a copyright work, the prompt is only a theme. | [EP study PE 774.095](https://www.europarl.europa.eu/RegData/etudes/STUD/2025/774095/IUST_STU(2025)774095_EN.pdf), [judgment 10 C 13/2023](https://msp.gov.cz/documents/14569/1865919/10C_13_2023_10) (both primary) |
| 5a | C2PA: which models embed it | PARTLY CONFIRMED | Black Forest Labs (FLUX): yes, through the API and the playground, not in self-hosting. Google: C2PA for Nano Banana Pro in the Gemini app, Vertex AI and Google Ads. The Gemini API documentation speaks only of the SynthID watermark. OpenAI: according to the help pages, images from ChatGPT and from the API have C2PA and SynthID (I did not load the page, I know only a search snippet). Adobe Firefly: yes, but only from secondary sources. Midjourney: no, only from secondary sources. | [BFL help](https://help.bfl.ai/articles/3705384267-c2pa-in-flux-generated-images), [Google blog 20 Nov 2025](https://blog.google/technology/ai/ai-image-verification-gemini-app/), [Gemini API docs](https://aistudio.google.com/docs/image-generation) (primary), [OpenAI help](https://help.openai.com/en/articles/8912793-c2pa-in-chatgpt-images) (not loaded), [c2paviewer](https://c2paviewer.com/articles/ai-tools-c2pa-support) (secondary) |
| 5b | C2PA: tool for reading | CONFIRMED | `c2patool` is a CLI from the Content Authenticity Initiative. The latest version v0.28.4 came out on 26 Oct 2026. Installation: ready binaries for macOS, Windows and Linux from the Releases page (they can be downloaded into `.tools/`, which fits D6), or Homebrew. `c2patool file` prints the manifest as JSON. License MIT / Apache 2.0. There is also a C API (`c2pa_c_ffi` in c2pa-rs) and the c2pa-c binding, both on top of the Rust library. | [c2patool](https://github.com/contentauth/c2patool), [usage.md](https://github.com/contentauth/c2patool/blob/main/docs/usage.md), [c2pa-rs](https://github.com/contentauth/c2pa-rs), [c2pa-c](https://github.com/contentauth/c2pa-c) (primary) |
| 6 | EU AI Act, Art. 50 | CONFIRMED: no direct obligation for our case | Art. 50 applies from 2 Aug 2026. Para. 2 (machine-readable marking) targets providers of generative systems, i.e. OpenAI, ElevenLabs and the like. Older systems have until 2 Dec 2026. Para. 4 obliges the deployer to label only deepfakes and texts on matters of public interest. The Commission guidelines explicitly say that "AI-generated fictitious environments (e.g. fictitious forests and castles) in video games" are not deepfakes. Source code is outside the scope of para. 2. | [Commission guidelines on Art. 50](https://digital-strategy.ec.europa.eu/en/library/guidelines-transparency-obligations-providers-and-deployers-ai-systems) ([PDF EN](https://ec.europa.eu/newsroom/dae/redirection/document/131215), points 68, 88, 153 and the examples at point 116), [Art. 50](https://artificialintelligenceact.eu/article/50/) |
| 7 | Library licenses | CONFIRMED | All licenses fit the plan. Nothing is copyleft. Details in the table below. Obligations: include the texts of the MIT, BSD, Apache and HarfBuzz licenses and state the sentence about FreeType. | LICENSE files in the repositories, links below |
| 8 | Screenshots of other games as an internal reference | UNCERTAIN | It is common practice, but no primary source explicitly allows it. The rules of Rockstar and Blizzard cover only public non-commercial fan use, not internal use by another studio. AI providers want the customer to have rights to the inputs. | [Rockstar policy](https://support.rockstargames.com/articles/200153756/Policy-on-posting-copyrighted-Rockstar-Games-material), [Blizzard Video Policy](https://www.blizzard.com/en-us/legal/dd76b654-f2c4-4aaa-ba49-ca3122de2376/blizzard-video-policy) (both only from search snippets), [Anthropic Commercial Terms, L.1](https://www.anthropic.com/legal/commercial-terms) (primary) |

## Details on the items

### 1. Steam

- The exact sentence from Steamworks: "We are aware that many modern game development environments have AI powered tools built into them. Efficiency gains through the use of these tools is not the focus of this section." Source: [Content Survey](https://partner.steamgames.com/doc/gettingstarted/contentsurvey).
- Pre-Generated is content that "ships with your game and is consumed by players". Live-Generated is content created "while the game is running". Same source.
- Valve does not want Live-Generated adult-only sexual content. It does not concern us. Same source.
- From secondary sources: the description of AI use is shown to customers on the game page and the form is supposed to cover marketing materials in the store too. For Live-Generated, players can report content through the overlay. Source: [GamingOnLinux](https://gamingonlinux.com/2026/01/valve-tweak-steam-ai-disclosure-form-for-developers-to-clarify-its-for-content-consumed-by-players). On the Steamworks page this is not explicit today.
- Valve's original announcement from January 2024 is titled "AI Content on Steam". I could not load the text automatically, I confirmed only the title. Link: [Steam News](https://store.steampowered.com/news/group/4145017/view/3862463747997849618).

### 2. ElevenLabs

- Terms of Use, §1(c): free users may use the service only non-commercially. But the page [Commercial Sound Effects](https://elevenlabs.io/sound-effects/commercial) says: "For commercial sound effects, our free plan requires attribution to elevenlabs.io." The two texts contradict each other. The safe way is to generate only on a paid plan.
- If the game stops meeting the terms or the subscription ends: the terms do not say what happens to the rights to sounds generated during the subscription. I did not load the help page that covers it (HTTP 403): [help.elevenlabs.io](https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-publish-the-content-I-generate-on-the-platform).
- Sound length is at most 30 seconds. WAV 48 kHz is only for non-looping effects. The price is 40 credits per second when the length is specified. Source: [SFX documentation](https://elevenlabs.io/docs/overview/capabilities/sound-effects).
- The documentation recommends setting `model_id` explicitly and trying both models on your own prompts. Source: [model overview](https://elevenlabs.io/docs/overview/models).

### 3. AI music

- I did not load the UMG and Warner press releases (the sites cannot be downloaded). I have the dates of the deals only from secondary sources.
- In September 2026 Suno admitted that it downloaded audio from YouTube with the yt-dlp tool for training, and defends itself with fair use. Source: [Wikipedia: Suno](https://en.wikipedia.org/wiki/Suno_(platform)) (secondary).
- Since 3 Sep 2026 Suno limits the number of song downloads per month. Same source.
- New finding: ElevenLabs has its own music service with terms for games. "Indie Games" (game revenue under 500,000 USD and developer revenue under 1 million USD per year) are exempt from the exclusion for "Studio Games". After crossing the threshold there are 60 days to move to a higher plan. Source: [Eleven Music Terms](https://elevenlabs.io/music-terms) (primary, version from 9 Oct 2026). The terms do not say what the model was trained on.
- Item 4 applies here too: purely AI music would not be protected by copyright.

### 4. Copyright

- The Copyright Office report, verbatim: "Copyright does not extend to purely AI-generated material, or material where there is insufficient human control over the expressive elements." And further: "prompts do not alone provide sufficient control." Source: [Part 2, p. iii](https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-2-Copyrightability-Report.pdf).
- The Prague judgment, point 12: an image created by AI "is not a copyright work under § 2 of the Copyright Act", because it is not a "unique result of the creative activity of a natural person". The assignment is a "theme of the work or possibly an idea". Source: [10 C 13/2023-16](https://msp.gov.cz/documents/14569/1865919/10C_13_2023_10). Note: the court dismissed the claim mainly because the plaintiff did not prove that the image arose from his assignment. The sentence on the copyright work is stated as an obiter dictum.
- What this means for us is my judgment, not a verified fact. Code written by AI and the graphics from it have uncertain protection. The human contribution may be protected: the design, the selection from variants, the tuning of parameters, the arrangement of the whole and manual edits. The case "a human curates the parameters of a generator written by AI" has not been explicitly addressed by any office or court.
- Weak protection does not prevent selling the game. It only means it would be harder to forbid others from taking individual textures or sounds.
- The US office wants AI material to be stated when registering a work, if it is more than negligible. Source: [guidance from March 2023](https://www.copyright.gov/ai/ai_policy_guidance.pdf) (I did not re-read it today).

### 5. C2PA

- The FLUX manifest contains: the "AI generative" label, the BFL signature, the creation time, the model name and version, and a hash of the image data. It does not contain the prompt or the seed. Source: [BFL help](https://help.bfl.ai/articles/3705384267-c2pa-in-flux-generated-images).
- C2PA therefore does not replace our own provenance. We must record the prompt, seed and license ourselves.
- The metadata is lost on format conversion, cropping or re-saving. That is why the original file must be kept unchanged.
- `c2patool` without further options prints the JSON manifest to standard output. The option `-d` gives a detailed dump, `--info` a short one. Source: [usage.md](https://github.com/contentauth/c2patool/blob/main/docs/usage.md).

### 6. EU AI Act

- Guidelines, point 153: Art. 50 applies from 2 Aug 2026. The amendment ("AI Omnibus") gives providers of older generative systems until 2 Dec 2026, and only for marking under para. 2. Source: [guidelines PDF](https://ec.europa.eu/newsroom/dae/redirection/document/131215).
- Guidelines, point 154: content generated before 2 Aug 2026 does not have to be marked retroactively.
- Guidelines, point 88: content generated in real time in games may have an exemption from marking if the player knows it is AI. That would matter only if the game called AI at runtime.
- Examples that are not deepfakes: an AI voice for fictional characters in games and fictional environments in games. A deepfake would be a realistic likeness of a real person or place that looks genuine.
- The file I downloaded today has the date 5 Nov 2026 and the mark C(2026) 7702 final. The Commission page states adoption on 20 Jul 2026 and an update on 5 Nov 2026. Law firms cite the July version C(2026) 5054. I did not compare what changed between the versions.
- I did not load the text of the amendment (Regulation (EU) 2026/1744) on EUR-Lex. I have the regulation number only from secondary sources.

### 7. Library licenses

| Library | License (verified in the repo) | Obligation when distributing the binary | Link |
|----------|--------------------------|------------------------------|-------|
| SDL3 | zlib | None. Acknowledgment is voluntary. | [LICENSE.txt](https://github.com/libsdl-org/SDL/blob/main/LICENSE.txt) |
| SDL_ttf | zlib | None for SDL_ttf. It pulls in FreeType, HarfBuzz, PlutoSVG and PlutoVG. | [LICENSE.txt](https://github.com/libsdl-org/SDL_ttf/blob/main/LICENSE.txt), [README](https://github.com/libsdl-org/SDL_ttf/blob/main/README.md) |
| FreeType | FTL or GPLv2, one is chosen | Choose FTL. The game's documentation must contain a sentence that the software is based in part on the work of the FreeType Team. The name FreeType must not be used in advertising without permission. | [LICENSE.TXT](https://github.com/freetype/freetype/blob/master/LICENSE.TXT), [FTL.TXT](https://github.com/freetype/freetype/blob/master/docs/FTL.TXT) |
| HarfBuzz | "Old MIT" | The copyright and the license text in all copies. In practice: include the text. | [COPYING](https://github.com/harfbuzz/harfbuzz/blob/main/COPYING) |
| PlutoSVG, PlutoVG | MIT | Include the license text. It can be turned off with the option `SDLTTF_PLUTOSVG`. | [LICENSE](https://github.com/sammycage/plutosvg/blob/master/LICENSE) |
| Jolt Physics | MIT | Include the license text. | [LICENSE](https://github.com/jrouwe/JoltPhysics/blob/master/LICENSE) |
| miniaudio | Public domain or MIT No Attribution | None. | [LICENSE](https://github.com/mackron/miniaudio/blob/master/LICENSE) |
| Dear ImGui | MIT | Include the license text if it is in the shipped game. | [LICENSE.txt](https://github.com/ocornut/imgui/blob/master/LICENSE.txt) |
| Clay | zlib | None. | [LICENSE.md](https://github.com/nicbarker/clay/blob/main/LICENSE.md) |
| meshoptimizer | MIT | Include the license text. | [LICENSE.md](https://github.com/zeux/meshoptimizer/blob/master/LICENSE.md) |
| Tracy | BSD 3-Clause | If the client is in the shipped binary: the license text in the documentation and a ban on using the name for promotion. | [LICENSE](https://github.com/wolfpld/tracy/blob/master/LICENSE) |
| libebur128 | MIT | Include the license text. | [COPYING](https://github.com/jiixyj/libebur128/blob/master/COPYING) |
| FSR1 | MIT (AMD) | Include the license text. | [license.txt](https://github.com/GPUOpen-Effects/FidelityFX-FSR/blob/master/license.txt) |
| Manifold | Apache 2.0 | Include the license text and any NOTICE file, mark your own modifications. Applies only when the library is distributed with the game. | [LICENSE](https://github.com/elalish/manifold/blob/master/LICENSE) |

Notes:

- For a closed commercial game none of this is a problem. The only trap is FreeType: the GPLv2 variant must not be chosen.
- Jolt, Dear ImGui, Tracy and Manifold are in C++. An engine in C17 needs C wrappers. Third-party wrappers have their own licenses, for example [JoltC](https://github.com/amerkoleci/joltc/blob/main/LICENSE) and [cimgui](https://github.com/cimgui/cimgui/blob/docking_inter/LICENSE) are MIT.
- Tracy carries other code inside (libbacktrace). The simplest way is not to compile the client into the release version at all.
- Fonts have their own licenses. I did not verify them because the plan names no specific font.

### 8. Screenshots of other games

- That it is common is claimed only by forums and blogs (secondary): for example [gamedev.net](https://gamedev.net/forums/topic/679269-mock-ups-and-copyright/?page=2). Community consensus: inspiration is fine, redrawing almost pixel by pixel is a risk.
- Rockstar allows fans to share footage non-commercially and reserves the right to take content down at any time. The rules say nothing about internal use by another studio or about AI. The same for Blizzard. I could not load either page in full.
- Risks as I see them:
  - Saving a screenshot is a copy of another's work. As long as it stays internal, the risk is small, but we do not have explicit permission.
  - A repository, even a private one, may open up or be shared over time. Then it would be distribution.
  - Sending an image to an AI service means handing it to a third party. Anthropic wants a guarantee that the customer has "all rights and permissions required to submit Inputs". For other vendors I did not read the terms.
  - The main risk is not the reference itself, but the result. Style is not protected. Specific characters, logos, maps and recognizable models are.
  - When the evaluator pushes the look toward "looks like GTA III", the chance that the result will be too similar to the original grows.

## Impact on the plan

1. **Report for Steam.** Provenance must cover everything the player sees and hears: textures from AI images and sounds from ElevenLabs. All of it falls under Pre-Generated. Live-Generated does not concern us as long as the game does not call AI at runtime. It is good to include the graphics for the store page in the report too.
2. **Code written by AI in the report.** The form does not clearly require it, but does not rule it out either. I recommend having one honest sentence ready saying that the graphics are drawn by code written with the help of AI. The decision is the owner's (question 1).
3. **ElevenLabs: a paid plan when generating.** Add to provenance: plan, date, `model_id`, prompt, length, `prompt_influence`, terms version (9 Oct 2026). A "seed" field for audio makes no sense, the API does not have it.
4. **ElevenLabs: a sound is a one-off artifact.** The output cannot be repeated and model v2 ends on 1 March 2027. The generated file in the repo is therefore the only source of truth. Generate new sounds directly with model v3, or expect later sounds to sound different.
5. **ElevenLabs: sounds must not be available separately.** The terms forbid distributing the output as isolated files. My judgment: in the game it is safer to have the sounds packed in an archive than as loose WAV files. And they must not end up in a public repository.
6. **Music.** The decision "no music from AI" stays. Nothing refutes it.
7. **Copyright.** Provenance should also record the human contribution: who picked the variant, what was edited by hand, which parameters a human tuned. That is the only part that can be protected. Do not rely on protection of raw AI outputs.
8. **C2PA.** When saving an AI image: keep the original file unchanged, compute a hash, run `c2patool` and store the JSON next to it. Fields in provenance: "C2PA present / missing / verification status". Missing C2PA must not be an error. Do not write our own parser in C, the CLI is enough. Because of D6, download the `c2patool` binary into `.tools/`, do not install it into the system.
9. **EU AI Act.** No work now. Re-verify if the game starts generating content at runtime or realistically depicts real persons or places.
10. **Licenses.** Create a file with the texts of third-party licenses and a "Credits / Licenses" screen in the game. Add the sentence about FreeType. Choose FTL at build time. Do not compile Tracy into the release version.
11. **Reference screenshots.** Keep them out of the repository. Never put them in the game, in marketing or in public comparisons. Compare general properties (palette, detail density, silhouette readability), not specific objects. Do not give AI the task "make it the same".
12. **A second evaluator from another vendor.** Our own renders are our content, I found no legal obstacle. But I did not verify the terms of a specific cheap vendor, because the plan names none. Before choosing, check whether the vendor trains on inputs. If foreign screenshots were also sent to the evaluator, item 11 applies.

## Questions for the owner

1. **Will we also state on Steam that the graphics are drawn by code written by AI?** The form does not clearly require it. An open admission is safer toward Valve and players, but the game gets an "AI" label even for procedural graphics.
2. **Which ElevenLabs plan and how long to keep it?** We do not know what happens to the rights after the subscription is canceled. Options: keep the subscription active at least until release, or get written confirmation from ElevenLabs that the rights remain.
3. **Model v3 right away, or still v2?** Model v2 ends on 1 March 2027. If the set of sounds is to sound uniform, it is better to start on v3 directly.
4. **Will the engine repository ever be public?** If yes, ElevenLabs sounds must not be in it and must live elsewhere.
5. **May foreign screenshots be sent to third-party AI services?** The safer variant is to compare them only locally, or to send only our own renders and describe the reference in words and numbers.
6. **Does weak copyright protection of AI assets matter?** If yes, the human contribution needs to be raised (manual edits, own selection and arrangement) and recorded. If not, the plan does not change.

## What could not be verified

- The text of Valve's 2024 announcement "AI Content on Steam" (the page loads without content). Only the title is confirmed.
- Whether the AI description is shown on the game page and whether the form also covers marketing. I have it only from secondary sources.
- OpenAI's help on C2PA and Adobe's help on Content Credentials (HTTP 403). OpenAI's guide to image generation is silent on C2PA: [developers.openai.com](https://developers.openai.com/api/docs/guides/image-generation).
- Whether the Gemini API returns C2PA, or only SynthID.
- The UMG and Warner press releases on the deals with Suno and Udio.
- Regulation (EU) 2026/1744 on EUR-Lex (the page loads empty).
- The full texts of the Rockstar and Blizzard rules (timeout).
- What ElevenLabs trained its sound effects model on. Neither the documentation nor the terms state it.
- The terms of the "cheap model of another vendor" for the second evaluator. The plan names none.
