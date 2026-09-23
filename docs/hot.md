# Hot V1

## Context and prompts

Standard Hot asks whether the two members are together or apart before creating the Hangout. The resulting `same_place` or `apart` value is stored on `hangouts.context` and cannot change during that session. Server selection uses active Hot prompts at the current intensity whose context is either `both` or the stored context, and excludes every prompt already used in that Hangout.

Every session starts Flirty. Rounds use the common private-answer/reveal lifecycle and expose universal Skip. Skip immediately replaces the prompt, does not count it as completed and cannot be disabled by a level decision.

## Mutual escalation

After two completed Flirty prompts, the server opens a private Bold gate. After two Bold prompts, it opens the Spicy gate. Each member votes independently; snapshots expose only the caller's vote and the number submitted. If both accept, the level increases. Otherwise it stays where it is and both see only “staying here :)”. A declined gate is not repeatedly reopened during the session.

Spicy continues until the members finish, skip, or abandon. Finishing creates a completed result; End Hangout abandons it and creates no result.

## KitKat

KitKat is derived at the Thing level and remains unlocked once three previous completed Hot results have `reached_spicy = true`. Abandoned sessions never count and the UI exposes no unlock progress. In a later session, after two completed Spicy prompts, both members receive a separate private KitKat opt-in. Unlock is availability, not consent: both must accept before intensity 4 prompts can appear.

Completed Hot results store `prompts_completed`, `highest_level`, fixed `context`, `reached_spicy` and `reached_kitkat`. Recent activity shows only those summary fields and never prompt content.

The legacy Our Deck private-batch foundation remains available for existing data. Drawing/discard behavior is outside Hot V1.
