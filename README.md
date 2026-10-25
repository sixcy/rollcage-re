# Rollcage source reconstruction

## Foreword (this section is written by me, a human)

Getting, one day, a reverse engineered Rollcage has been an unreachable dream. Unreachable because of the sheer amount of work required for such an effort.

Recently, I saw news of REA - Reverse Engineer Anything (https://github.com/morluto/rea/tree/main) and how people are using it to do all kind of things : complete decompilation, game mashups, game porting to other consoles..

The world of proprietary software is fracturing as we speak. I do not know if it is a good or a bad thing.

But I know one thing for sure: a completely reverse-engineered Rollcage is now reachable.

So I've set up REA, installed Ghidra, installed Codex, set it up to use GPT-6.1-Sol, and up we go..

The only prompt I gave it was:
> This project contains a shortcut to Rollcage directory, containing Rollcage video game. I want you to use REA to decompile Rollcage into C source files. The goal is to be able to make modifications to the sources and recompile them to get a modified version of Rollcage.

And the agent has been figuring things out and generating reverse-engineering details ever since..

### What this repository is

I am just dumping in there the results of the agent-powered reverse engineering. I must insist: **nothing** is done by me. The AI is doing everything. My only job is to press Continue and answer clarification questions.

I will be updating the repo regularly after each Codex session (that ends whenever I am out of AI Credits, basically).

This repository **is not** Rollcage source code or a recreation of it.

So, what will you actually find in there?
- A bunch of .md files describing what the AI found
- A lot of JavaScript excerpts that specify the game algorithms ; unit tests to validate them
- A few demos in .html like [the Track Viewer](docs/track-viewer.html), with publishable pages in `docs/`

What can we make of it? For now, nothing much. But, after a while, when Mr AI will have done his diligent work, this could be the basis to build tools to modify the game data or even the game itself.

### Related Work

I know there are some people who are taking the approach of rewriting each game function one by one. This is much cleaner but also takes a lot more time. I genuinely have no idea of what the end result is going to be or how maintainable/modifiable my naive REA approach is going to produce. I do have hopes on the matter; it's "just" language translation after all, and LLMs excel at that. But I do not want this to undermine the work of others.

Let's be clear on that: this repository is cheap. Zero work involved. It's literally cheating our way out.

But something is better than nothing - and, perhaps, this repository will give a preliminary step until the more structured approaches emerge.

With all this being said.. Let's move on to the AI slop.

## Current tools and reconstruction

Open [Track Viewer](docs/track-viewer.html) or [3D Object Viewer](docs/object-viewer.html) locally and select your own archives. Processing stays on your computer. The pages embed code, not game assets.

- Explore/export all 40 Rollcage LOW/HIGH environments, 66 Stage II environments and 33 Firebugs disc environments.
- Racing test runs one to six Expert AI cars, default three, with weapons/pickups, selected-car follow and race telemetry. It is super experimental; LEV16/17 racing remains unavailable.
- Edit terrain heights/surfaces, pickups, existing route points/checkpoint planes/starting slots, and scenery/effects across all 20 Rollcage levels. Original special/scripted objects support coherent transforms; compatible plain models also support add/import/duplicate/delete. Save combined version-4 projects and export archives for a separate game copy. Native checks cover selected terrain/model contacts, scenery construction and LEV16/17 loading.
- Inspect/export textured models and seven assembled Rollcage cars. Stage II and Firebugs expose ordinary scenery.

[Current status](re-docs/reconstruction-status.md) · [Research index](re-docs/README.md) · [Viewer changelog](docs/changelog/index.html) · [Historical evidence](RESEARCH.md)

The implementation is JavaScript reference code. A complete C/C++ rebuild and continuous native-race equivalence remain unfinished.

## Development workflow

Run Node.js at the repository root; there is no package-manager build step.

```powershell
node tools/build-track-viewer.mjs
node tools/build-object-viewer.mjs
node tools/check-editor.mjs analysis/editor-check-NEW
node tools/validate-archive.mjs
```

The first two commands regenerate the standalone pages. Editor checks do not launch the game. Browser checkers use an existing local Edge/Playwright installation. Installed-data validators read the installation without changing it. Native observation tools launch isolated copies and belong to a separate announced workflow.

`node --test` is the broad regression command. Some instruction checkers have fixed historical report paths: use an isolated workspace before a broad sweep. The retained 2026-10-24 run recorded 52 failures, classified in analysis/editor-inherited-failures-20261025-v1.json. A passing editor group does not mean every native-replay test passes.

Reports and extractions require new output names. Preserve original game files and retained evidence. Deliveries rebuild the viewer and add dated entries under docs/changelog/.
