# Visual review and approval in practice, checked against D86

Research date: 2026-11-09. Question: how do shipped engines, studios and test tools review and approve rendered output, and does D86 (review pages, `wzctl review export` / `import`, `review/decisions.jsonl`) match that practice?

Method: web search plus reading the primary documentation or source where it could be fetched. A claim marked **unverified** could not be confirmed from a primary source (the page was blocked, or only a secondary source or a forum post was found).

Two families of tools exist, and D86 merges them:

- **Regression triage** (Unreal, Unity, Skia Gold, Chromatic, Percy, Playwright, BackstopJS, reg-suit, Filament, Blender): "is this image still the approved image?" The verdict belongs to an image, usually found by test name plus platform, sometimes by content hash.
- **Art review** (Flow Production Tracking, SyncSketch, ftrack, Kitsu, Frame.io): "is this version good enough?" The verdict is a status on a version of a shot or asset, with notes and drawings from a named person.

---

## 1. Unreal Engine: Screenshot Comparison tool

| Topic | What Unreal does | Source |
|---|---|---|
| Approve flow | The Screenshot Browser offers **Add New** (adds the screenshot to the ground truth folder and to a pending source control change list), **Replace** ("Deletes all examples of ground truth data and replaces them with the newest screenshot") and **Add As Alternative** (adds another accepted version for legitimate hardware or driver differences). | [Epic: Screenshot Comparison Tool](https://dev.epicgames.com/documentation/en-us/unreal-engine/screenshot-comparison-tool-in-unreal-engine) |
| First run | The first run of a screenshot test gives a warning that asks you to add the new screenshot as ground truth. | [Epic: Screenshot Comparison Tool (4.26)](https://docs.unrealengine.com/4.26/en-US/TestingAndOptimization/Automation/ScreenShotComparison) |
| Who can approve | No roles are defined. The approve buttons are disabled without a source control connection, so the approval is in effect a source control change by a source control user. (The second half is my reading, the docs do not say it in these words.) | [Epic: Screenshot Comparison Tool](https://dev.epicgames.com/documentation/en-us/unreal-engine/screenshot-comparison-tool-in-unreal-engine) |
| Where verdicts live | In the ground truth image files themselves, in source control. There is no separate verdict log. Incoming captures go to `Saved/Automation/Comparisons`. | same |
| Ground truth folder path | **Unverified.** The docs do not name it. A forum user reports `Test\Screenshots\<TestName>\...\Windows\D3D11_SM5`. The engine API has `GetIdealApprovedFolderForImage`. | [forum thread](https://forums.unrealengine.com/t/functional-test-how-take-screenshot/438474), [API index](https://dev.epicgames.com/documentation/unreal-engine/API/Developer/ScreenShotComparisonTools/IScreenShotManager) |
| Per platform | Screenshots are bucketed by `Platform_RHI_ShaderModel`. With alternatives, the system picks the ground truth that matches closest by metadata. | [Epic: Screenshot Comparison Tool](https://dev.epicgames.com/documentation/en-us/unreal-engine/screenshot-comparison-tool-in-unreal-engine) |
| Tolerance | Presets Zero, Low, Medium, High, Custom. **Low is the default because temporal anti-aliasing changes pixels between runs.** Per-channel RGBA tolerance, min and max brightness, **Maximum Local Error** (catches a local hot spot) and **Maximum Global Error**. No perceptual metric. | same |
| Re-approval | A changed image fails the comparison and shows up in the browser again. The user chooses Replace or Add As Alternative. | same |
| Exported report | `-ReportExportPath=<dir>` writes `index.json` and `index.html`. Epic's "report server" is a plain file-serving web server "with no back-end" (`http-server` from npm). The JSON has `comparisonExported` and `comparisonExportDirectory` fields. | [Epic: Setting up an Automation Test Report Server](https://dev.epicgames.com/documentation/unreal-engine/setting-up-an-automation-test-report-server), [Epic: Review test results](https://dev.epicgames.com/documentation/unreal-engine/review-test-results-in-unreal-engine) |
| Approving build farm results | The build farm takes the screenshot, and a person approves remotely by giving the Screenshot Browser the network path shown at the top of the automation report. The static report itself has no approve button. | [Epic: Screenshot Comparison Tool](https://dev.epicgames.com/documentation/en-us/unreal-engine/screenshot-comparison-tool-in-unreal-engine) |
| Horde | The Automation Hub shows Gauntlet results when tests run with `-WriteTestResultsForHorde`; events can include screenshots. Whether the hub shows a full screenshot comparison view is **unverified**: only a forum thread where a user could not get it to populate. | [Epic: Horde Automation Hub](https://dev.epicgames.com/documentation/unreal-engine/horde-automation-hub-for-unreal-engine), [forum thread](https://forums.unrealengine.com/t/how-to-setup-and-configure-automated-screenshot-comparison-testing-in-horde/2843190) |

## 2. Unity: Graphics Test Framework

| Topic | What Unity does | Source |
|---|---|---|
| Approve flow | A test with no reference fails and saves its capture to `Assets/ActualImages`. In the Graphics Tests window the user checks the image and clicks **Accept Result**, which copies it to `Assets/ReferenceImages`. Moving the file by hand does the same. Older versions: rename or merge the `ActualImages` folder into `ReferenceImages`. | [Unity GTF 9.0: running tests the first time](https://docs.unity3d.com/Packages/com.unity.testframework.graphics@9.0/manual/test-authoring/running-graphics-tests-first-time.html), [GTF 7.2 manual](https://docs.unity3d.com/Packages/com.unity.testframework.graphics@7.2/manual/index.html) |
| Where verdicts live | In the reference image files in the project. No verdict log, no approver identity in the docs. | same |
| Per platform | Folders by color space, platform, architecture, graphics API and XR device. Lookup goes from the most specific folder up. **Optimize Images** replaces identical per-platform references with one shared image in `ReferenceImagesBase`. | [GTF 9.0: Test Results tab](https://docs.unity3d.com/Packages/com.unity.testframework.graphics@9.0/manual/test-investigation/graphics-test-results-tab.html), [GTF 9.0: what's new](https://docs.unity3d.com/Packages/com.unity.testframework.graphics@9.0/manual/whats-new/whats-new-9.html) |
| Review UI | A slider between reference and test image, a **Difference** view and a **Heatmap** view, zoom, and a cross-platform comparison mode. Buttons: Accept Result, Clear Result, Delete Reference Image. | [GTF 9.0: Test Results tab](https://docs.unity3d.com/Packages/com.unity.testframework.graphics@9.0/manual/test-investigation/graphics-test-results-tab.html) |
| Tolerance | `ImageComparisonSettings`: a per-pixel threshold on DeltaE ("perceptual difference between two colors") and a threshold on the average DeltaE over the image. Which DeltaE formula is used is **unverified**. | [ImageComparisonSettings API (7.3)](https://docs.unity3d.com/Packages/com.unity.testframework.graphics@7.3/api/UnityEngine.TestTools.Graphics.ImageComparisonSettings.html) |

## 3. Skia Gold, Chromium, Flutter

Gold is the clearest model of a verdict record, so its schema is quoted in detail.

| Topic | What Gold does | Source |
|---|---|---|
| States | Three labels per image: **positive**, **negative**, **untriaged**. Untriaged is the default for anything without a label. Negative means "this image is wrong and must be fixed". | [Skia: Gold docs](https://skia.org/docs/dev/testing/skiagold), [Gold SQL schema](https://skia.googlesource.com/buildbot/+/refs/heads/main/golden/go/sql/schema/tables.go) |
| Verdict key | Primary key `(grouping_id, digest)`. The grouping is at first the test name. "Digest is the MD5 hash of the pixel data." **The verdict belongs to the content of the image, not to a file path.** | [Gold SQL schema](https://skia.googlesource.com/buildbot/+/refs/heads/main/golden/go/sql/schema/tables.go), [Gold Firestore design](https://skia.googlesource.com/buildbot/+/b2265e3673b70636c785decde89da2b1a43a608c/golden/go/expstorage/fs_expstore/FIRESTORE.md) |
| Several correct images | One test can have many positive digests (one per platform or GPU). Results vary by OS, architecture and backend. | [Skia: Gold docs](https://skia.org/docs/dev/testing/skiagold) |
| Identity | Each triage event is a record: "UserName is the email address of the logged-on user who initiated the triage event", plus `TriageTime` and the branch. Viewing is public, triage needs login and contributor rights. Flutter: "Triage permission is currently restricted to members of flutter-hackers." | [Gold SQL schema](https://skia.googlesource.com/buildbot/+/refs/heads/main/golden/go/sql/schema/tables.go), [Flutter: golden file tests](https://flutter.googlesource.com/mirrors/flutter/+/4a838195035cc72fdf8c492b3538a9574e869785/docs/unsorted_wiki/Writing-a-golden-file-test-for-package-flutter.md) |
| History and undo | A triage event has one record row and one delta row per affected digest, with `LabelBefore` and `LabelAfter`. Undo applies the opposite change only if the current label still equals `LabelAfter`. Bulk triage is one event with many deltas. | [Gold Firestore design](https://skia.googlesource.com/buildbot/+/b2265e3673b70636c785decde89da2b1a43a608c/golden/go/expstorage/fs_expstore/FIRESTORE.md) |
| Re-approval | Automatic by construction: a changed render has a new digest, and a new digest is untriaged. In Chromium, a test passes only if "the image's hash is already an approved baseline". | [Chromium: GPU pixel testing with Gold](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/gpu_pixel_testing_with_gold.md) |
| Change under review | Verdicts given on a change list are stored apart (keyed by branch name such as `gerrit_12345`) and merged into the main expectations only when the change lands. | [Gold SQL schema](https://skia.googlesource.com/buildbot/+/refs/heads/main/golden/go/sql/schema/tables.go), [Chromium doc](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/gpu_pixel_testing_with_gold.md) |
| Near-identical diffs | Per-test **inexact matching**: `fuzzy` (max number of different pixels, per-pixel delta threshold) and `sobel` (ignore pixels on edges, then fuzzy). An image that passes inexact matching is "automatically approved in Gold", so there is still a record of what was produced. | [Chromium doc](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/gpu_pixel_testing_with_gold.md), [imgmatching package](https://beta.pkg.go.dev/go.skia.org/infra/gold-client/go/imgmatching@v0.0.0-20241227224101-9dab19606d40) |
| Known-noisy configs | **Ignore rules** with a creator, an expiry time, a note (usually a bug link) and a query on trace keys. | [Gold SQL schema](https://skia.googlesource.com/buildbot/+/refs/heads/main/golden/go/sql/schema/tables.go), [Skia: Gold docs](https://skia.org/docs/dev/testing/skiagold) |

## 4. Web visual testing tools

| Tool | Verdict key | States | Identity | Re-approval | Tolerance | Source |
|---|---|---|---|---|---|---|
| **Chromatic** | Per story and mode, per git branch (baseline found by walking git ancestry). One accept covers all browsers. | unreviewed, accepted, denied. Deny fails the build; a denied change is unreviewed again in the next build. | Roles: Developer can approve, **Reviewer "cannot ... approve their own changes"**, Viewer cannot approve. Baseline history shows "when the baseline changed, by who, and in which commit". | "Accepted snapshot needs no re-acceptance until it changes." Review is enabled only for the latest build on a branch; comments are disabled on old builds. | `diffThreshold` default `.063`, colour distance in YIQ; anti-aliased pixels are detected and ignored by default. | [branching and baselines](https://www.chromatic.com/docs/branching-and-baselines), [quickstart](https://www.chromatic.com/docs/quickstart), [collaborators](https://www.chromatic.com/docs/collaborators), [threshold](https://www.chromatic.com/docs/threshold) |
| **Percy** | Per snapshot, per branch. | unreviewed, approved, **changes requested**. You can approve one snapshot, a group of matching diffs, or the whole build. | Approver shown per snapshot: **unverified**. | Identical snapshots need approval once per branch; a snapshot that changes again loses the carried approval. "Changes requested" also carries forward and blocks one-click approve-all. | not checked | [Percy approval workflow](https://www.browserstack.com/docs/percy/visual-testing-workflows/view-percy-build-results/approval), [Percy blog: changes requested](https://medium.com/perceptual-percy/new-in-percy-changes-requested-workflow-4c9c6daaaf03) |
| **Playwright** | A PNG file next to the test, name carries browser and platform (`example-test-1-chromium-darwin.png`). | none (pass or fail) | None in the tool. The docs say to commit the snapshot folder and "review any changes to it", so the identity is the git commit and the code review. | `--update-snapshots` on the command line. | pixelmatch; `threshold` default 0.2, `maxDiffPixels`. | [Playwright snapshots](https://playwright.dev/docs/test-snapshots) |
| **BackstopJS** | Reference bitmap files by scenario and viewport. | none | Not recorded. | `backstop approve` copies the last test images over the references (`--filter` for a subset). | Resemble.js; `misMatchThreshold` default 0.1 %, `requireSameDimensions`. | [BackstopJS README](https://github.com/garris/BackstopJS) |
| **reg-suit** | Expected images in S3 or GCS, keyed by a git commit hash chosen by walking the branch graph. | none | Not in the tool. The report is posted to the pull request, and the approval is the pull request review (my reading; the README describes no approval step). | Next comparison uses the images of the merged commit. | `thresholdRate`, `thresholdPixel`, `matchingThreshold` (YUV distance), `enableAntialias`. | [reg-suit README](https://github.com/reg-viz/reg-suit) |

## 5. Static HTML reports: what exists, and what they cannot do

| Tool | Report | Can you approve in the report? | Source |
|---|---|---|---|
| Unreal | `index.html` + `index.json` on a file server with no back-end. | No. Approval is in the editor's Screenshot Browser, pointed at the report's network path. | [Epic: report server](https://dev.epicgames.com/documentation/unreal-engine/setting-up-an-automation-test-report-server) |
| Playwright | "HTML reporter produces a self-contained folder ... that can be served as a web page." Diff, actual, expected, side-by-side and slider views are reported by third-party guides (**unverified** from the official page). | No. Baselines are updated from the command line. | [Playwright reporters](https://playwright.dev/docs/test-reporters) |
| reg-suit | HTML report published to S3 or GCS, link posted to the pull request. | No. | [reg-suit README](https://github.com/reg-viz/reg-suit) |
| Blender | `render_report.py` writes `report.html` with reference, new and diff images (diff made with OpenImageIO `idiff`). | No. `BLENDER_TEST_UPDATE=1 ctest -R <suite>` copies the new renders over the references. | [render_report.py (archived repo)](https://projects.blender.org/archive/blender-archive/src/branch/universal-scene-description/tests/python/modules/render_report.py) |
| BackstopJS | Browser report. | **Only with a local service running**: `backstop remote` starts an HTTP service that the report's approve button calls. | [BackstopJS README](https://github.com/garris/BackstopJS) |
| Filament | `viewer.py` shows a local run or a CI run. | No. Goldens live in a separate repo (`google/filament-assets`); a person with write access pushes a golden branch and names it in the commit message (`RDIFF_BRANCH=`). There is also `RDIFF_ACCEPT_NEW_GOLDENS`, where CI renders and merges the new goldens after the merge; the docs warn that nothing verifies them before they land. | [Filament: renderdiff](https://google.github.io/filament/dup/test_ci_renderdiff.html) |

Finding: **a static HTML report is common practice. A static HTML page that also collects the approval is not.** Every tool that approves in a browser (Gold, Chromatic, Percy, the art review tools below) has a server and a login. Every tool with a static report approves somewhere else (command line, editor, source control). BackstopJS is the one in-between case, and it needs a local HTTP service.

## 6. Art review tools in production pipelines

| Tool | Statuses | Notes and drawing on the frame | Identity and access | Source |
|---|---|---|---|---|
| **Flow Production Tracking** (ShotGrid) | Autodesk's recommended Version statuses: N/A, **Pending Review** (default for a new version), Pending Director Review, **Viewed** (reviewed, not final), **Final Approved**. Shot statuses include **CBB** ("almost complete but could be better"). An automation sets the shot to Final Approved when a linked version gets Final Approved. Statuses are site-configurable. | In the Client Review Site: annotation icon, "draw directly on the frame", a note text box, attachments by drag and drop, replies. **Approve** with an optional comment, and **Unapprove** to reverse. | Clients open an invitation link, optionally with a password; "on a desktop or on a mobile device". Email notification when a version is approved. | [Autodesk: tracking statuses](https://help.autodesk.com/cloudhelp/ENU/SG-Tutorials/files/SG_Tutorials_tu_tracking_statuses_html.html), [Autodesk: Client Review Site for clients](https://help.autodesk.com/cloudhelp/ENU/SG-Producer/files/pr-reviews/SG_Producer_pr_reviews_pr_client_review_clients_html.html) |
| **SyncSketch** | Customizable approval statuses; "approve media" is a role permission. **Unverified** (support centre returned 403; from a product listing and a Netflix partner guide seen only in search results). | Two kinds of annotation: sketches (drawings over the image) and comments. Notes export as PDF or CSV (with item status and frame number), sketches as a zip. Notes can be marked resolved. **Unverified** for the same reason. | By role. | [SyncSketch: Annotations](https://support.syncsketch.com/hc/en-us/articles/32393836987668-Annotations), [SyncSketch: Resolving Notes](https://support.syncsketch.com/hc/en-us/articles/32393770127380-Resolving-Notes) |
| **ftrack Review** | Two buttons for every participant: **Approve** and **Require changes**. The feedback can then set the version status in ftrack Studio. **Unverified** (help centre returned 403; from search result snippets). | Draw on frames and write comments; comments, annotations and status changes go into a PDF report. **Unverified**. | Invited collaborators sign in. | [ftrack help: client review](https://help.ftrack-studio.backlight.co/hc/en-us/articles/13129920598423), [ftrack Review update April 2022](https://help.ftrack-review.backlight.co/hc/en-us/articles/13129339229847-Updates-to-ftrack-Review-April-2022) |
| **Kitsu** (open source) | Typical loop WIP → Waiting For Approval → Done, with **Retake** back to WIP and an automatic retake counter. **Unverified** (from a docs mirror, not the official site). | Drawing annotations on the preview frame, with pen pressure since 2025. | Logged-in users; client-allowed statuses are configurable (**unverified**). | [CGWire blog: March 2025 update](https://blog.cg-wire.com/build-in-public-march-2025), [Kitsu docs mirror](https://www.mintlify.com/cgwire/kitsu/tasks/reviews) |
| **Blender Studio Render Review** | One action: "Push to Edit & Approve Render". Approving copies the frames to `shared/editorial/frames`. The docs record no approver and no time. | none | Kitsu login. | [Blender Studio: Render Review](https://studio.blender.org/tools/artist-guide/project_tools/usage-render-review) |
| Frame.io | Approved, Needs Review, In Progress. **Unverified** (secondary sources only). | Frame-accurate comments tied to a version. **Unverified**. | — | [Streaming Media tutorial](https://www.streamingmedia.com/Producer/Articles/Editorial/Featured-Articles/Tutorial-Previewing-and-Reviewing-Client-Videos-with-Frame.io-121729.aspx) |

Common pattern in art review:

- The verdict is a **status on a version**, and a new version starts again at "pending review". An old approval never moves to a new version.
- There is always a state between approve and reject: "viewed", "pending director review", "require changes", "retake", "could be better".
- Feedback is **pinned to the picture** (a drawing on a frame), not only free text.
- An approval can be taken back (Unapprove), and the history stays.
- Review from a phone browser is normal (Autodesk says so directly).

## 7. Perceptual metrics and near-identical images

| Tool | How it tolerates noise | Source |
|---|---|---|
| Unreal | Per-channel tolerance plus max local and max global error; default preset Low because of TAA. | [Epic](https://dev.epicgames.com/documentation/en-us/unreal-engine/screenshot-comparison-tool-in-unreal-engine) |
| Unity | Per-pixel DeltaE threshold plus average DeltaE threshold. | [Unity API](https://docs.unity3d.com/Packages/com.unity.testframework.graphics@7.3/api/UnityEngine.TestTools.Graphics.ImageComparisonSettings.html) |
| Gold | Exact hash by default; per-test fuzzy and Sobel matching; several positives per test; ignore rules that expire. | [Chromium doc](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/gpu_pixel_testing_with_gold.md) |
| Chromatic | YIQ distance threshold `.063`, anti-aliasing ignored, unstable snapshots flagged so they do not block the build. | [threshold](https://www.chromatic.com/docs/threshold), [test docs](https://www.chromatic.com/docs/test) |
| Playwright, reg-suit, BackstopJS | pixelmatch / YUV distance / Resemble.js mismatch percentage, with anti-aliasing options. | links in section 4 |
| Blender | OpenImageIO `idiff`. | [render_report.py](https://projects.blender.org/archive/blender-archive/src/branch/universal-scene-description/tests/python/modules/render_report.py) |
| Filament | Own `diffimg` tool; goldens are valid only for one pinned platform (Linux/aarch64, Mesa, SwiftShader), other hosts are "advisory". | [Filament: renderdiff](https://google.github.io/filament/dup/test_ci_renderdiff.html) |
| NVIDIA FLIP | A research tool with a per-pixel error map. NVIDIA says: if you need one number, use the **mean** FLIP value. The original version handles only LDR; HDR needs HDR-FLIP. | [NVIDIA: FLIP](https://research.nvidia.com/publication/flip) |

I found **no shipped engine or test service that documents FLIP or SSIM as its pass/fail gate**, and no published FLIP threshold for regression tests. The tools above use simple per-pixel colour distance with a pixel-count limit. The project's choice of FLIP is not contradicted by this, but there is no outside number to copy: the threshold must be calibrated on our own renders.

In every tool the tolerance belongs to the **test configuration**, not to the approval. A person approves an image; the machine then decides what counts as "the same image".

## 8. AI-agent-driven pipelines with human approval (2025–2026)

| Example | What is known | Source |
|---|---|---|
| Ubisoft, "From Brief to Scene: Agentic AI for Asset Production at Ubisoft", DigiPro 2026 (the day before SIGGRAPH 2026) | USD infrastructure, microservices and AI agents build a first USD scene from briefs, concept art and a library of over 30,000 assets. A trade report says "Every step remains human-validated." **The interface of that validation (web page, DCC viewport, chat) is unverified**: the ACM page returned 403. | [3dvf report](https://3dvf.com/usd-ia-unreal-simulation-digipro-2026-met-les-pipelines-sous-les-projecteurs/), [ACM DL entry](https://dl.acm.org/doi/10.1145/3819990.3820033) |
| Community agent skills for game art (sprite generation where "you approve one" of several takes; a critic agent that compares a screenshot with a target image) | Chat-based approval, no verdict log. **Unverified**, secondary source only. | [quickmatch.si guide](https://quickmatch.si/guides/best-ai-agent-skills-for-game-dev/) |
| Vendor advice (Virtuall) | Record review decisions and rejection reasons with each AI-made asset. Vendor blog, not a description of a shipped pipeline. | [Virtuall blog](https://virtuall.pro/blog/game-assets-ai-pipelines-need-before-production-begins) |

**I found no documented 2025–2026 example of an AI-agent game or asset pipeline where a human approves visuals on a web page and the verdicts flow back into a machine-read log.** D86 has no direct precedent to copy. The closest building blocks are Gold (hash-keyed verdict log with identity) and the client review sites (phone approval with notes on the frame).

---

## What this means for D86

### (a) Confirmed by practice

1. **Export of a static HTML report by a tool** is standard: Unreal (`index.html` + `index.json`, a server "with no back-end"), Playwright ("self-contained folder"), reg-suit, Blender. Keeping transport outside the engine matches how those reports are hosted.
2. **Approval in a browser, also from a phone,** is standard in art review (Autodesk Client Review Site: "on a desktop or on a mobile device").
3. **A record of who and when** matches Gold (`UserName`, `TriageTime` per triage event) and Chromatic's baseline history ("by who").
4. **Append-only history** matches Gold's event-plus-delta records, which keep the label before and after and allow undo.
5. **One record written by two front ends** (studio and page) has a parallel in Gold, where the web UI and the automatic matcher write the same expectations.
6. **A/B pairs and a diff view on the page** match what every tool shows (Unity slider, difference and heatmap; Chromatic 1-up, 2-up, diff).
7. **The same act approves both the look and the golden** is how Unreal and Unity work: "Add New" or "Accept Result" turns the reviewed image into the reference.

### (b) Gaps we should add

1. **Key every verdict by content hash.** A verdict row must carry the item id and the hash of the exact image (and of the recipe or build that made it). Gold keys verdicts by `(test, MD5 of pixel data)`; Chromatic and Percy drop the approval the moment the snapshot changes. `review import` must refuse a verdict whose hash no longer matches the current render ("stale"), and `golden_accept` must accept only the hash that was approved. Without this, an approval given to yesterday's picture can bless today's.
2. **Say who the approver really is, and do not let the author approve.** In every browser-approval tool the approver is a logged-in account (Gold: email; Flutter: a named group; Autodesk: invitation link and password). Chromatic's Reviewer role "cannot approve their own changes". A static page on "any static host" has no login, and in our setup the agent builds the page and also imports the verdicts, so "who" is only a claim. Minimum: each row stores `actor_kind` (owner, agent, automatic rule), the transport, and whether the transport proved identity; verdicts that open an owner gate or accept a golden must come through a channel the agent cannot fill in by itself, or be listed back to the owner for confirmation.
3. **Define the return path of a static page.** No tool studied accepts verdicts from a purely static page; BackstopJS needs a local HTTP service for it. D86 must name the mechanism (a verdict file the page offers for download or copy, or the host's own stored state) and give the review set an id and a nonce so an import can be matched to exactly one export.
4. **Add an explicit "not reviewed" state and one middle state.** Gold has untriaged; Percy has unreviewed and changes requested; Autodesk has Pending Review, Viewed and CBB; ftrack has Require changes; Kitsu counts retakes. Proposed set: `untriaged` (default, a missing row means this), `approved`, `changes_requested` (with a note; the item comes back), `rejected` (this exact image is wrong; Gold's "negative", kept by hash so the same output is flagged if it reappears). A partly filled page must import cleanly.
5. **Pin notes to the image.** Every art review tool lets the reviewer draw on the frame; Chromatic pins a discussion to a spot on the snapshot. For an agent, a note with a point or rectangle in image coordinates is far more usable than free text. Store `{x, y, w, h}` (normalised) with the note; freehand drawing can wait.
6. **Decide what one approval covers across platforms.** Unreal buckets by `Platform_RHI_ShaderModel` and has "Add As Alternative"; Unity has per-platform folders with a shared base; Gold allows many positives per test; Filament trusts only one pinned platform. We have golden hashes on 3 OS and FLIP images on lavapipe and Metal. Rule to write down: the owner approves the look once on a named reference configuration; the other platforms' goldens are accepted automatically if they are within the FLIP threshold of the approved image, and that is recorded as an automatic row that points to the owner's row (Gold does the same for inexact matches).
7. **Record automatic and bulk approvals as such.** Gold writes one event with one delta per image; inexact matches are "automatically approved" but still recorded. "Approve all" on the page must still write one row per item and hash.
8. **Supersede, do not edit.** Autodesk has Unapprove; Gold undoes by a new event. State in the format that the last row per (item, hash) wins and a withdrawal is a new row.
9. **Show the metric next to the picture, keep the tolerance out of the verdict.** In all tools the threshold is part of the test, not of the approval. The page should show the FLIP mean and error map for each A/B pair. The FLIP threshold needs our own calibration: no shipped tool publishes one.
10. **Expiring ignore rules for known-noisy items** (Gold: creator, expiry, note, query) are worth copying when a render is known to flicker, instead of raising the global threshold.

### (c) Where practice contradicts D86

1. **"An approval on a page on any static host counts as the owner's confirmation."** Practice does not do this. Approval that changes a baseline is always tied to an authenticated identity (a login, or a source control user). This is the main weakness of D86 as written; see gap 2.
2. **Approve / Reject as the only verdicts.** No tool studied is binary. All have at least "not reviewed yet", and art review tools all have a "changes wanted" state that is different from "this image is wrong".
3. **One page for two jobs.** Practice separates regression triage (hash-keyed, technical) from art review (version-keyed, with statuses and drawn notes). Merging them is not wrong, but the record must serve both: the hash key from Gold and the version history and statuses from art review. D86 as written describes only a flat verdict per item.
4. **Not contradicted, no precedent found:** the local-only reference slot. Review tools normally upload reference material; none of the sources describe a slot that shows a local file without uploading. It is a standard browser capability, so nothing speaks against it.
