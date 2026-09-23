# Souvenirs

Souvenirs are durable, server-awarded keepsakes. Clients cannot insert or spoof them.

| Key | Mode | Unlock |
| --- | --- | --- |
| `FIRST_THOUGHT` | Same Brain | First completed session |
| `SAME_BRAIN` | Same Brain | Three consecutive matches |
| `LOCKED_IN` | Same Brain | Five consecutive matches |
| `PERFECT_SYNC` | Same Brain | Eight of eight matches |
| `HEAT_CHECK` | Hot | First completed Hot Hangout |
| `TURNED_UP` | Hot | First mutually accepted transition into Bold |
| `AFTER_HOURS` | Hot | First mutually accepted transition into Spicy |
| `KITKAT` | Hot | First mutually accepted transition into KitKat |

`KITKAT` is not awarded when the secret level merely becomes eligible. It is inserted inside the locked escalation transaction only after both votes accept and the Hangout level changes to KitKat. Unique constraints make every unlock idempotent, so the souvenir remains after the repeatable gameplay counter resets.

Definitions and artwork paths live in `src/lib/souvenirs.ts`. Space loads every title, description, engine, fallback label and SVG path from that registry. Final sticker artwork can be added under `public/souvenirs/` without changing React code. The initial paths are `first-thought.svg`, `locked-in.svg`, `heat-check.svg`, `turned-up.svg`, `after-hours.svg` and `kitkat.svg`; missing files render a typographic sticker fallback.
