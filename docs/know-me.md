# Know Me

Know Me is an eight-round shared Hangout. Seat A is the subject on odd rounds and seat B on even rounds. The subject answers “what would you pick?” while the other member privately predicts that answer. The server selects eight distinct active `know_me` prompts and stores the subject on each `hangout_rounds` row.

`know_me_snapshot` returns the caller's role and own answer. It never returns the other answer until both rows exist and the round becomes `revealed`. The reveal describes a correct prediction as “you got it” without winners or compatibility language. Refresh and polling rebuild the same role, round and answer state.

Completion stores:

```json
{
  "rounds": 8,
  "correct_predictions": 5,
  "predictions_by_user": { "user-id": 3, "other-user-id": 2 }
}
```

Space aggregates total predictions, correct predictions, accuracy and best session rate. Abandoned sessions retain partial rows but create no result and contribute nothing.
