# Space

`/thing/[thingId]/space` is the persistent shared memory shelf. It is separate from the Hub and combines a compact streak/Hangout summary with Same Brain, Know Me, This or That and Hot highlights. `space_snapshot` remains member-authorized and derives stats only from completed Hangouts.

Souvenirs are unique by `(thing_id, souvenir_key)`, retain their source Hangout and unlock time, and render as collectible keepsakes. Same Brain keeps `FIRST_THOUGHT`, `SAME_BRAIN`, `LOCKED_IN` and `PERFECT_SYNC`. Hot adds `HEAT_CHECK`, `TURNED_UP`, `AFTER_HOURS` and `KITKAT`.

The current streak uses distinct UTC completion dates. This remains the documented MVP rule until a shared timezone exists.
