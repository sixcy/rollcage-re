# Rollcage and Stage II tools

[Open the Track Viewer](track-viewer.html)

Explore Rollcage's 20 tracks in their LOW and HIGH PC versions, plus 66 Stage II environments: 20 race, 25 scramble, 10 training, 5 deathmatch, 5 pursuit and 1 football. Use orbit, pan, zoom, or fly-in controls. Download complete static terrain and ordinary objects as OBJ, materials and PNG textures for import into Blender; a JSON manifest records game identity and reconstruction limits.

Select your own `ROLLCAGE.IMG` and `ROLLCAGE.IDX` files from the same installation. Both games use these filenames, usually located in:

```text
C:\Program Files (x86)\Psygnosis\Rollcage\IDXData
C:\Program Files (x86)\Psygnosis\Rollcage Stage II\IDXData
```

The supplied archives are identified automatically by index identity and decoded sample hashes. Select another matching pair to switch games. For unrecognized releases, choose a game explicitly to attempt loading; compatibility remains unverified. Stage II validation targets the supplied installation containing Rollcage Extreme.

Files are processed locally in your browser. No game assets are included in this website or uploaded when you use it. Effects, overlays, special objects, original lighting, and game simulation remain outside the viewer.

This `docs/` directory is the static website root for GitHub Pages publishing. Its [landing page](index.html) and Track Viewer use relative links and need no server-side code. You can also open either HTML file locally. Reconstruction notes live in `re-docs/` at the repository root.

To regenerate `track-viewer.html` after changing its sources, run `node tools/build-track-viewer.mjs` from the repository root. Sources live in `tools/track-viewer/`; browser-check reports remain in `analysis/track-viewer/`.
