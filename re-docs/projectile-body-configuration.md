# Original projectile body configuration

The shared projectile/wormhole initializer at `5ec408` contained a 125-byte
transcription of a 128-byte original table. Its first difference was byte
101. That shifted the mass fields: constructed bodies received mass
134217728 and inverse mass 2097152 instead of original values 8192 and
524288. This was an upstream configuration error; the body arithmetic did
not cause it.

The corrected literal reproduces all 128 bytes from retained read `3162`,
evidence `ev_7e90a726d7a555e601824bd1d784e2d8dc2a00183b62d6458a461a23d6f81d85`,
for target SHA256
`c0582271862ec373f00d01545c2a95aef0abb10a32513ec585271d08b10c6cf5`.
`tests/projectile-body-configuration.test.mjs` independently compares the
initializer with that read and the SHA-verified installed executable,
preserves bytes 128 through 131, and checks mass/inverse mass on all 31
constructed projectile, master, and wormhole bodies. Its interpreted native
constructor receives the retained configuration independently, so a shared
incorrect initializer cannot mask the defect on both sides.

Historical constructor oracles copied the same source-initialized table to
both executions. They checked arithmetic and constructor operations, but
could not establish immutable table identity. The independent retained and
executable byte assertions close that particular gap.

Run `node --test tests/projectile-body-configuration.test.mjs
tests/projectile-construction.test.mjs tests/wormhole-construction.test.mjs`.
These checks establish original configuration bytes and constructed source /
interpreted-instruction state. They do not establish original-process combat
or a complete weapon interaction matrix. The installed executable is read
only; no test launches it.

Validation: the three named test files pass all 11 tests with no skips.
`verifyProjectileConstruction({scenarios:8,leaves:64,output:null})` also
passes 104 interpreted calls and 942,363 instruction steps. The explicit
null output preserves historical reports.
