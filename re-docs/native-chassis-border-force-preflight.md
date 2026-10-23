# Offline chassis/border force preflight

`tools/check-native-chassis-border-preflight.mjs` runs complete ordinary source
physics from a cloned original native frame. It changes only a declared signed
force increment at the actual participant chassis+74..7f. It does not run the
game, write a capture profile or modify installed files.

```powershell
node tools/check-native-chassis-border-preflight.mjs CAPTURE_DIRECTORY NEW_REPORT_FILE
```

The library function is
`checkNativeChassisBorderPreflight(input,output,options)`. Output is exclusive;
existing reports are never overwritten. Its CLI succeeds only if the baseline
matches and a complete source trial produces a selected chassis/border contact.
Misses and incomplete/unbound attempts remain in the report.

The baseline first executes real preparation, collision candidate generation,
queries, response and frame completion, then compares the unmodified result to
the original native after snapshot. Participants are resolved from the actual
`909300+i*30c` records and must retain their type3 body identity. Directions come
only from genuine generated candidate types6/7. Each chosen16-byte candidate is
also checked against the independently captured native after bytes, with its
actual packed normal, cell, sector, vertex and plane point preserved.

The default fixed set is both signs of4,16 and64 Q16 scalars along at most four
native border normals per participant, with at most24 trials. Increments use
the native quantized normal directly through `multiplyQ16`; no assumed world
X/Z direction or normalization is substituted. The increment and final signed
force lanes are bounded by01000000h, with checked addition and no wrapping or
clamp. Each trial changes one participant only.

The clone updates all overlapping original input spans consistently and proves
every other byte unchanged. The complete3e78h chassis record is preserved
outside the12-byte force window, including position, momenta, quaternion,
velocity, torque, inertia, matrix, spatial links, shape/cache headers and vehicle
wheel/contact/control state. The entire original entry is hashed again after
the trials to prove it was not mutated. Source physics may then change those
states normally; they are not frozen during the simulation.

A qualifying source event must be a complete-frame kind1 contact for the
selected actual type3 chassis, with an actual terrain-border classification,
matching type6/7 candidate cell and normal, and swept/penetration/sliding
response. Camera contacts, rejected/damping records, model-producer ambiguity,
partial dispatch streams and unbound execution are not winning trials. The
report retains the complete source event stream even for misses. Changed-force
outputs are never compared to the original unchanged native output.

## Retained clock348 result

Input:
`analysis/native-physics-local/startup-20261022/hidden-selected-collision-capture`.
The unmodified complete frame matches4885396 native semantic bytes and has two
type4 physical-camera/border contacts. They are not chassis coverage.

Participant1 has four genuine type7 border directions, at sector8 rows73–76,
column21. The other five chassis have no admissible border candidate in this
baseline. All24 fixed force trials complete the genuine source frame, finishing
19 bodies, with no unbound dependencies. Eight produce selected chassis/type7
contacts; three include contact with their exact planned plane. The signed
four-unit trials all miss and remain recorded.

The smallest same-planned-plane forecast is trial14:

| Field | Declared/observed value |
| --- | --- |
| Actual participant | 1 |
| Original force | `[0,0,0]` |
| Original border type/cell | type7, cell4920584, sector8/row75/column21 |
| Native normalQ16 | `[15360,0,62464]` |
| Signed scalarQ16 | `-1048576` (-16 units) |
| Force increment/final input | `[-245760,0,-999424]` |
| Source selected contacts | swept and penetration; same actual plane |

Reports are
`analysis/native-chassis-border-force-preflight-v1-20261023.json` and the
strengthened candidate-byte proof in
`analysis/native-chassis-border-force-preflight-v2-20261023.json`. Tests cover
signed arithmetic, exact mutation boundaries across complete/partial overlaps,
all24 genuine retained source trials, bounded misses, immutable input and
exclusive output handling. No body constructor or empty spatial bucket is used.

This establishes a bounded source forecast from an original state, not a
controlled native chassis-wall match. Before any native experiment, a separately
reviewed observer/intervention profile still needs actual slot/clock/phase,
pose/orientation/spatial/original-force guards and exact direct dispatch plus
complete-frame native/source comparison. Natural or controlled wall coverage,
ceiling contacts, inverted orientation and sustained inverted driving remain
distinct required runtime scenarios. Missing future geometry/effect/audio or
callback inputs must remain failures; this preflight supplies none by guessing.
