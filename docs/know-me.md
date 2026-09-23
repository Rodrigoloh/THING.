# Know Me

Know Me asks “can you predict what is true for the other person?” It is intentionally asymmetric and distinct from Same Brain, where both people answer the same quick preference independently.

Each of eight rounds stores a subject: Thing seat A on odd rounds and seat B on even rounds. The subject answers a self-anchored question privately, while the predictor sees “How well do you know {name}?” and predicts the subject's choice. The subject's answer is never returned to the predictor before both submit. The reveal labels the subject's answer and prediction separately, without winner language.

After reveal, the subject may add one explanation of up to 140 characters or skip it and continue. `know_me_explanations` is Thing-member-only, does not affect scoring and remains attached to that round. Outsiders cannot select answers or explanations.

Migration 009 retires the preference-like provisional Know Me rows from migration 008 and installs eight self-anchored prompts such as reactions to stress, reassurance and remembered gestures. Future imports should preserve that direction.

Completion still stores total predictions, correct predictions and per-user correct counts. Space can derive accuracy from those results. Same Brain behavior and scoring are unchanged.
