# 2026-10-25 · Clearer connection gaps and larger path points

- Two-way branch connections now align their dash patterns, so opposite arrows no longer paint over each other's gaps. Short centred dashes occupy30% of each period, with70% left clear. Explore and Reverse track share the same pattern.
- Branch arrowheads sit within filled dashes so they also preserve the gaps when viewed edge-on.
- Path-point circles increase from7 to14 pixels across, doubling their radius. Point markers and merge/split shapes retain their separate toggles.
- GPU checks verify a visible dash and an empty gap with both connection directions drawn, plus the larger hollow circle's rim and transparent centre/corners.
