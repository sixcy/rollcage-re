# Repository Guidelines

## Project Structure & Module Organization

This repository reconstructs Rollcage asset formats and game algorithms in JavaScript; a complete game rebuild remains unfinished.

- `src/`: ES modules for archive decoding, geometry, collision, and physics, plus recovered JSON tables.
- `tests/`: focused regression tests named `<module>.test.mjs`.
- `tools/`: extraction, validation, export, probing, and retained-instruction comparison scripts; shared helpers live in `tools/lib/`.
- `analysis/`: retained evidence, generated reports, and extracted samples.
- `docs/`: GitHub Pages website root, containing the landing page and standalone Track Viewer. Open `docs/track-viewer.html` locally. Keep research notes in `re-docs/`.
- `re-docs/` and `RESEARCH.md`: reconstruction notes, function addresses, evidence, and unresolved behavior.

## Build, Test, and Development Commands

Run commands from the repository root with Node.js. Reference tools require no downloaded dependencies; there is no package-manager build step.

- `node --test`: run the full test suite.
- `node --test tests/btp.test.mjs`: run one module's tests.
- `node tools/validate-archive.mjs`: validate installed archive contents and decoded structures.
- `node tools/verify-suspension-instructions.mjs`: compare reconstructed suspension arithmetic with retained x86 instructions.
- `node tools/export-scene.mjs 'LOW/LEV1.BLP' level1-scene`: export geometry, textures, and a viewer to a new directory.

Installed-data tools default to `C:\Program Files (x86)\Psygnosis\Rollcage`; extraction, validation, and scene export accept an optional final installation-directory argument. REA/Ghidra is needed to extend native analysis.

## Coding Style & Naming Conventions

Use `.mjs` ES modules, explicit relative import extensions, and Node built-ins. Follow nearby formatting: most source modules use two-space indentation, semicolons, and single quotes. Use kebab-case filenames, camelCase functions and variables, and PascalCase classes. No formatter or linter configuration is present. Preserve fixed-point widths, signedness, and native offsets; cite recovered function addresses in comments where applicable.

## Testing Guidelines

Use `node:test` with `node:assert/strict`. Add descriptive tests for recovered behavior, malformed inputs, and arithmetic boundaries. Run relevant instruction comparisons for native arithmetic changes and installed-data validators for parser changes. No numeric coverage threshold is configured. Distinguish synthetic fixtures and interpreted-instruction matches from original-process runtime evidence.

## Commit & Pull Request Guidelines

Existing commits mostly use date summaries such as `21/10/2026`; no formal commit convention or PR template is present. Prefer concise, descriptive summaries for focused contributions. PRs should explain changed behavior, cite supporting evidence, list validation commands and results, and identify remaining limits. Include screenshots for viewer changes and link related issues when available.

## Evidence & Output Handling

Keep installed game files read-only. Use new output filenames and directories: extraction and scene export refuse overwrites. Preserve retained evidence and update relevant research notes when reconstruction claims change.
