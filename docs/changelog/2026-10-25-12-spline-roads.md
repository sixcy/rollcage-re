# 2026-10-25 · Draw new spline roads

- Track editor → New roads draws a centreline on terrain or a chosen working height. Select control points to change position, width and banking, then inspect the shaded preview before Apply road.
- Roads can form standalone strips, ramps and banked bridges. Start/end snaps match an entire existing boundary and its column count. Open edges remain open; loops, inversion, tunnels and junctions are outside this delivery.
- Optional AI routes copy a reference group's speed settings and require explicit entry/exit links. The generated points remain editable with the Route points tool.
- Applied roads support selection, reshaping, deletion, undo/redo, surface painting, version-6 projects and LOW/HIGH archive export. Paint follows its road across sector/cell reindexing; deleting a road removes its dependent paint and retires its generated route IDs.
- Exports contain new native sectors, collision planes, spatial/recovery lookup, visibility and render initializer data. Native capacities and unsupported geometry reject before changing the draft. LEV16/17 remain editable, with AI racing disabled.

All 40 resources pass source construction checks and combined editor checks. Browser acceptance covers actual drawing, painting, generated routes, history, project reload, ZIP contents and three-car Test changes. Final original-game LEV1 LOW/HIGH captures each hit a newly created sector: wheel point and normal match the exported plane exactly. Seam traversal, every road shape and complete AI races remain unverified.
