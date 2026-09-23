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

`KITKAT` is not awarded when the secret level merely becomes eligible. It is inserted inside the locked escalation transaction only after both votes accept and the Hangout level changes to KitKat. Unique constraints make every unlock idempotent.
