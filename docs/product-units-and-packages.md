# VanStock – Units of measure and packaging requirements

**Status:** Design and additive metadata only; not operational.

## Source: Simplicity Air Rev6 SOP, Appendix page 6

| Type | Examples | Required usage behaviour |
| --- | --- | --- |
| ea | Controllers, sensors, valves, cylinders | Whole-number quantities |
| kg | Refrigerant R404A (10kg), R134A (12kg) | Decimal kg consumed, running cylinder balance, decrement cylinder count when emptied |
| m | Copper coil, pipe insulation, cable | Decimal metres consumed, running roll balance, decrement roll count when emptied |
| pack | Cable ties (minimum 10), screws (minimum 10), crimp connectors (minimum 5) | Still-have-stock / pack-finished; pack count changes on finish |
| container | Bottles, tubes, flux tins, solder sticks | Still-have-stock / finished; container count changes on finish |

## Development rules

- Product classification must be verified against the Master Parts list. Do NOT infer units from product names.
- Physical package quantity and remaining content are separate data; a van may hold multiple partial/full cylinders or rolls.
- Preserve billed usage (e.g. 2.5kg) separately from physical pack count so ServiceM8 can bill correctly.
- Opening warehouse balances must be physically checked and never inferred from van quantities.
- Quantities and units must be captured in each future audit transaction. Changing a product unit must not rewrite historical transactions.
- Values should use precise decimal numeric fields, not floating-point arithmetic, for kg/m where appropriate.
- Enforce minimum-issue increments per product for packs; do not conflate number of pieces used with count of packs finished.

## Current blockers

- Stock, warehouse stock, log and RPC quantity fields are INTEGER. Decimal inventory transactions cannot yet run.
- Legacy Add Product and Transfer forms assume whole numbers.
- No per-cylinder, per-roll or partially-used-pack tracking exists.
- Total inventory count across mixed units is not a meaningful metric.
- Supabase schema, transaction functions and ServiceM8 billing mapping require coordinated design and testing.

**No change to live data or behaviour has been made.** Implement and test a migration plan in a separate Supabase project before operational rollout.
