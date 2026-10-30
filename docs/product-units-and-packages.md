# VanStock – Simple stock units and refrigerant tracking (agreed)

**Status:** Design agreed; not installed or operational. Live inventory remains unchanged.

## Decision: refrigerant is one stock balance per type, per location

Each refrigerant is a **separate product** (R134a, R404A, R410A, etc.). Each van and warehouse stores the **total kilograms remaining for that product**, for example:

| Location | Product | Remaining |
| --- | --- | ---: |
| Van #3 | R134a | 8.5 kg |
| Van #3 | R404A | 6.0 kg |

- Using 2.5 kg of R134a reduces Van #3 R134a from 8.5 kg to 6.0 kg.
- A warehouse-to-van issue of 12 kg R134a subtracts 12 kg from the warehouse R134a balance and adds 12 kg to the selected van's R134a balance in one transaction.
- Different refrigerant types **never** share a combined balance.
- **Do not create individual cylinder records**, serial-number tracking, full/part-cylinder status, or automatic cylinder count deductions in this version.
- If multiple cylinders of the same refrigerant type are held, the app tracks **only their combined mass remaining**. The technician can locate the physical cylinder separately.
- Refrigerant cylinder numbers/weights needed for legal refrigerant handling, purchasing, or other external compliance records are **not replaced** by this simplified VanStock balance.
- Do not assume all cylinders have identical capacity. Record actual refrigerant kg transferred or consumed.

## Other stock – minimum necessary complexity

| Unit | Example | Version-one proposal |
| --- | --- | --- |
| ea | Sensor, valve, regulator | Whole-number count |
| kg | R134a, R404A | Decimal kg per product and location |
| m | Copper tubing, insulation | Decimal metres per product and location |
| pack | Cable ties, connectors | Whole packs **unless** individual-piece issuing is explicitly required for that item |
| container | Flux, chemicals | Whole containers; treat as one until replaced/finished |

Pack/container usage remains subject to approval because the original Rev6 SOP handles partially used packs differently. Do not silently replace agreed Rev6 behaviour in the production application.

## Source vs agreed simplification

The Rev6 SOP proposed cylinder-count reduction when emptied and detailed partially used pack/roll rules. **The user has now specifically approved a simpler refrigerant implementation:** stock by refrigerant type and total remaining kg; no cylinder-by-cylinder tracking. This is an intentional change to the earlier specification, not a claim that Rev6 already specified it.

## Technical requirements before release

1. Preserve existing van quantities and historical records. Never automatically interpret existing count values as kilograms.
2. Store each product's stock unit and use exact decimal quantities for kg and m (e.g. numeric with three decimal places, subject to confirmation).
3. Convert existing integer-only warehouse/van balance tables, logs, stock actions and transfer RPCs in a coordinated **tested** migration before enabling fractional quantities.
4. Keep a separate stock balance for each (location, product) pair. No cylinder entity or package-content ledger is required for refrigerants.
5. Validate nonnegative balances and stock transfer quantities; enforce atomic debits/credits and log who/when/quantity/reason.
6. Avoid a single summed stock number across unlike units (e.g. 8 kg + 3 ea).
7. Verify each existing product's correct unit before migrating production data.

**No Supabase migrations have been applied and no live deployment has occurred.**
