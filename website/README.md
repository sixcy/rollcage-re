# Rollcage tools

[Open the Track Viewer](track-viewer.html)

Explore all 20 tracks in their LOW and HIGH PC versions, using orbit, pan, zoom, or fly-in camera controls. Download a track as OBJ, materials and PNG textures for import into Blender.

Select your own `Rollcage.img` and `Rollcage.idx` files. Both are usually located in:

```text
C:\Program Files (x86)\Psygnosis\Rollcage\IDXData
```

Files are processed locally in your browser. No game assets are included in this website or uploaded when you use it.

This directory is the static website root for GitHub Pages publishing. Its [landing page](index.html) and Track Viewer use relative links and need no server-side code. You can also open either HTML file locally.

To regenerate `track-viewer.html` after changing its sources, run `node tools/build-track-viewer.mjs` from the repository root. Sources live in `tools/track-viewer/`; browser-check reports remain in `analysis/track-viewer/`.
