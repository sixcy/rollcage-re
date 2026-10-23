# Physics return ECX is a shared local

`4749e0` pushes incoming ECX at entry ESP minus 4, then saves its four
nonvolatile registers. The pushed word is a writable local, not a promise
that ECX survives the call. The original parent uses it as follows:

| Site | Operation |
| --- | --- |
| `474ac0` | Store decoded event time minus the original first body's frame clock. |
| `474ba5` | On second-to-first promotion only, subtract the filter's saved clock difference through the caller's pointer. |
| `474acc` | Copy the filtered delta into EBP for response and the loop cutoff. |
| `474ae7` | Replace the local with the first pointer loaded after response, including zero, before invalidation. |
| `474af0` | Reload that local after invalidation for candidate refresh. |
| `474b1d` | Pop the local into return ECX after final body advancement. |

Negative deltas still complete response, invalidation, refresh, and pointer
publication before ending the loop. If both bodies are filtered out, the
published word is zero. If only the second survives, filtering promotes it,
clears its second pointer, negates the normal, and adjusts the delta. The
second clock is read after the first acceptance callback, so callback
mutations matter. A null first pointer on initial event entry is invalid:
both the parent and filter dereference its frame clock before their later
null tests. The masked nineteen-bit event time cannot equal minus one.

With no events, the entry ECX word remains. Independent entry replay can
supply the observed incoming register. A joined replay must derive it or
leave the return unproved; stale parent-entry stack bytes are not a substitute
for a missing source register producer.

The immutable audit
`analysis/native-physics-return-local-audit-v3-20261023.json` checks target
SHA256 `c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`
against retained `278-physics-frame-assembly.json`,
`285-event-filter-assembly.json`, and `281-final-body-advance-assembly.json`.
Their evidence IDs are respectively
`ev_af519c4d443ad65b6ae8066d61eea98c1f5242aa2835d3fbe2e8fa35a296c87a`,
`ev_9c7046b4db31a4445e6c6329cebac23fd13e5390d774b2d3986ef85232d383f8`,
and `ev_f85d6409a8220db534c16cd254e4af3b2c34ec60dc2e211dc90ec66e2f5e67ab`.

The V3 source dispatch trace over actual original entry state ends with first
body `1129ef80`, matching the original captured return-local word. Its five
event rows are reconstructed-source observations; they are not independently
captured native per-event records. Original-process final memory parity
supports this case, while the filtered/null/negative cases above are static
deductions. Joined-parent completion remains separate: its earlier genuine
audio creation dependency is still open.
