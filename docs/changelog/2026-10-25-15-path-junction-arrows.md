# 2026-10-25 · Explore AI merges, splits and directions

- Explore → Show paths now draws Rollcage travel direction arrows and cyan stored branch connections. Gold rings identify merges (several paths in); pink diamonds identify splits (several paths out). A point can be both. Lines that merely cross do not imply a connection.
- Inspect a merge or split lists actual graph points and their incoming/outgoing counts. Focus selected marker frames the junction and its neighbours with a white selection ring.
- The selected-point explanation separates normal travel through a group from the two stored branch slots, and flags merges whose incoming branch connections exceed that limit when reversed.
- Reversed drafts also show pending, unapplied connections as dashed amber arrows in Explore. Their counts stay separate from compiled native links and disappear when resolved or restored.
- Nearby routes in Reverse track are now brighter, thicker, outlined and directional, so they stand out against road textures.

Direction and branch decoding is enabled for Rollcage. Stage II and Firebugs keep their prior stored-point display; no unverified branch semantics are applied to them. All40 Rollcage resources pass raw-byte graph/direction checks and paired LOW/HIGH consistency. Browser validation covers HIGH/LEV1 controls, marker focus, reverse pending connections, GPU depth/visibility and resource cleanup. No game capture is needed for this viewer update.
