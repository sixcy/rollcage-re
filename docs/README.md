# Rollcage, Stage II and Firebugs tools

[Open the Track Viewer](track-viewer.html)

Explore Rollcage's 20 tracks in their LOW and HIGH PC versions, 66 Stage II environments, and 33 Firebugs disc environments. Stage II includes 20 race, 25 scramble, 10 training, 5 deathmatch, 5 pursuit and 1 football environments. Firebugs includes variants and duplicates, labeled by archive resource ID. Use orbit, pan, zoom, or fly-in controls. Download static terrain and ordinary objects as OBJ, materials and PNG textures for import into Blender; a JSON manifest records game identity and reconstruction limits.

Select your own `ROLLCAGE.IMG` and `ROLLCAGE.IDX` files from the same installation. Both games use these filenames, usually located in:

```text
C:\Program Files (x86)\Psygnosis\Rollcage\IDXData
C:\Program Files (x86)\Psygnosis\Rollcage Stage II\IDXData
```

The supplied archives are identified automatically by index identity and decoded sample hashes. Select another matching pair to switch games. For unrecognized releases, choose a game explicitly to attempt loading; compatibility remains unverified. Stage II validation targets the supplied installation containing Rollcage Extreme.

For Firebugs, select a PS1 disc ZIP containing its CUE and referenced data BIN. The viewer reads the disc locally and skips audio tracks. Automatic identification targets the supplied Europe disc; choose Firebugs explicitly to attempt another release with unverified compatibility. Stored and deflated ZIP members and MODE2/2352 data tracks are supported. Track labels retain archive resource IDs where original names have not been established. Export manifests include disc identity and reconstruction limits.

On verified **Rollcage LOW/HIGH tracks except LEV16 and LEV17**, click **Start** in **Racing test** to watch one AI car drive. This is **super experimental**: driving, collisions and lap timing may be inaccurate. Pause/resume or reset the car, follow it with the chase camera, or switch to orbit/fly controls while it drives. The panel shows speed, completed laps, current lap time, and best lap. Hiding the tab pauses the test; switching tracks resets it. Stage II and Firebugs remain static previews.

Racing test connects recovered driving, physics, collision, checkpoint and recovery routines. The car and wheels come from your archive. The test uses viewer timing and a viewer follow camera; weapons, pickups, audio, scenery destruction and rendered effects are omitted. Downloads contain static track assets only.

Files are processed locally in your browser. No game assets are included in this website or uploaded when you use it. Runtime overlays, special objects, and original lighting remain outside the viewer.

This `docs/` directory is the static website root for GitHub Pages publishing. Its [landing page](index.html) and Track Viewer use relative links and need no server-side code. You can also open either HTML file locally. Reconstruction notes live in `re-docs/` at the repository root.

To regenerate `track-viewer.html` after changing its sources, run `node tools/build-track-viewer.mjs` from the repository root. Sources live in `tools/track-viewer/`; browser-check reports remain in `analysis/track-viewer/`.
