# Hot

## Runtime content

Migration `20260923000900_refine_hot_and_know_me.sql` makes the master import the only production Hot source. Eligible rows must be `active`, have `status = 'approved'`, match the stored Hangout context (`both` or the exact `same_place`/`apart` value), and match both the exact level and stable-ID prefix:

| Level | Required ID |
| --- | --- |
| Flirty | `HT-F-*` |
| Bold | `HT-B-*` |
| Spicy | `HT-S-*` |
| KitKat | `HT-K-*` |

There is no intensity-range or cross-level fallback. A missing eligible pool raises `prompt_pack_unavailable`; KitKat is never entered without an eligible `HT-K-*` row. The provisional Hot rows from migration 008 remain only for referential integrity and are inactive drafts.

Within a Hangout, the unique round constraint and selector exclude every used prompt ID. The selector first excludes IDs used in the Thing's last two completed Hot Hangouts. If that leaves no eligible row, older prompts become available again while current-session IDs stay excluded.

## Interaction loop

Every round has a focal subject, alternating Thing seat A/B. Metadata selects one simple interaction:

- `reveal`: the subject chooses privately, then both see the subject's answer.
- `guess`: the subject chooses first; only then may the other member predict. Neither sees the hidden answer before both submit.
- `move`: the subject reveals and the other member receives a context-compatible use-it step.

The durable loop is choose → reveal → react/use it → swap. `hot_reveals` stores the subject's selected option for resume and deterministic in-session callbacks. `hot_reactions` stores the other member's response/skip acknowledgement. A normal round cannot advance until that reaction is recorded. Universal prompt Skip remains available and bypasses the reaction without counting the prompt.

Every fourth eligible exchange may show a simple “remember this?” callback from an earlier reveal in the same Hangout. Prompt and response content never enters recent activity; completed results retain only counts, level, context and reached-level booleans.

## Escalation and KitKat

Bold and Spicy gates still appear after two completed exchanges at the current level. Votes remain private, both must accept and decline identity is never exposed.

Migration 011 stores repeatable progress in `things.kitkat_progress`. Each **completed** Hot Hangout whose result says `reached_spicy = true` counts once, regardless of how many Spicy exchanges it contained. Abandoned sessions and sessions that never reached Spicy do not count. Progress caps at 3 and can appear in the authorized Space summary. In a later session, the members reach Spicy normally and complete two Spicy exchanges before the hidden 🍫 gate appears.

Both members must privately accept. Displaying or declining the offer leaves progress at 3. Actual mutual entry resets progress to 0; the Hangout that consumes the cycle does not count toward the next one. On first entry, `things.kitkat_discovered_at` is written once and the current Hangout records `kitkat_first_discovery`; later sessions use a lighter return reveal. The permanent `KITKAT` souvenir remains after every gameplay reset. The first KitKat prompt is selected only after this vote and must be `HT-K-*`.

The legacy Our Deck batch foundation remains compatible and separate from standard Hot.
