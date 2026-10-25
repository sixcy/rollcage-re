# 2026-10-25 · Original special scenery transforms

## Available now
- Existing ordinary destructible and attached objects can move while preserving their native class, configuration and opaque metadata.
- Linked destruction-chain parts move and rotate together; attached static lights and emitters follow the transform.
- The viewer distinguishes transform-only objects from plain models that can also be duplicated, imported or removed.

## Validation and limits
- Forty LOW/HIGH variants pass no-edit identity and representative special-class transform checks. Focused tests exercise linked groups, attachment ownership and native light range updates.
- Authored tilt supports translation; unsupported yaw operations are disabled. Shared attachments require a coherent transform of their owners.
- Scripted moving objects are being implemented separately. Native scenery initialization/contact acceptance remains in progress.
