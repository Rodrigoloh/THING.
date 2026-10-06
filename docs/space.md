# Space

The Thing page is the Space. `/thing/[thingId]` combines identity, the current Hangout, recent activity, souvenirs, moment previews, chat fragments and compact milestones in one growing shared surface. `/thing/[thingId]/space` redirects to it and is no longer a separate destination. `space_snapshot` remains member-authorized and derives stats only from completed Hangouts.

Chat and Moments remain separate tools within that universe. Their previews are explicitly filtered by `thing_id`, bounded to three messages and four photos, and remain protected by their existing member-only RLS policies.

Souvenirs are unique by `(thing_id, souvenir_key)`, retain their source Hangout and unlock time, and render as collectible keepsakes. Same Brain keeps `FIRST_THOUGHT`, `SAME_BRAIN`, `LOCKED_IN` and `PERFECT_SYNC`. Hot adds `HEAT_CHECK`, `TURNED_UP`, `AFTER_HOURS` and `KITKAT`.

`things.kitkat_progress` is an internal repeatable gameplay counter. Completing a Hot Hangout that reached Spicy adds one, capped at three; one Hangout can never add more than one. It is never rendered in Space, even after discovery. Eligibility and a pending offer are not discovery. Only actual mutual entry writes `kitkat_discovered_at` and the permanent `KITKAT` souvenir; Space uses that souvenir as its canonical permission to show historical KitKat copy.

Souvenir artwork uses its natural SVG shape in a responsive scrapbook grid. The central registry supplies asset paths and text fallbacks, so absent final artwork does not break Space.

The current streak uses distinct UTC completion dates. This remains the documented MVP rule until a shared timezone exists.
