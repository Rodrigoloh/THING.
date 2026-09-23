# Prompt import

Runtime never reads Google Sheets. The content path is:

```text
Master Sheet → CSV or JSON export → scripts/import-game-prompts.ts → Supabase game_prompts → runtime RPCs
```

Run the importer from a trusted machine:

```bash
SUPABASE_SERVICE_ROLE_KEY=... npm run prompts:import -- ./prompts.csv
```

`NEXT_PUBLIC_SUPABASE_URL` must also be present. The service-role key is an operational secret and must only live in the shell or `.env.local`; never commit it or expose it to the browser.

Required columns are `stable_id` (or `prompt_id`), `game_type`/`engine`, bilingual prompt/options, `level`, `context`, `round_type`, `status`, `tags`, `adult` and `active`. `reaction_type` may be `respond`, `use_it` or `move`. CSV tags may be comma/pipe separated; JSON tags may be an array.

The importer validates Hot ID/level agreement, normalizes closed values and upserts on `stable_id`. It is idempotent and reports inserted, updated, skipped and total rows. It never promotes a row: only source rows explicitly marked `approved` become runtime-eligible. To activate a controlled development pack, mark those source rows `approved` and import them into the development project; production selection semantics stay identical.

The repository does not contain the external master library. Import the approved export, including the intended 50-row `HT-K-*` pool, after applying migration 009.
