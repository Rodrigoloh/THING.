# This or That

This or That uses eight distinct active `this_or_that` prompts. Both members see the same statement and privately vote for Thing seat A or seat B, displayed with the members' real names. One vote is never included in the other member's snapshot. The second vote reveals both choices atomically as agreement or split, without winner framing.

Completion stores raw shared totals:

```json
{
  "rounds": 8,
  "agreements": 6,
  "agreement_rate": 0.75,
  "votes_for_a": 14,
  "votes_for_b": 2
}
```

Space aggregates completed rounds, agreements and lifetime agreement rate. Refresh, reopening and polling always resume the current database round. Abandoned sessions do not contribute.
