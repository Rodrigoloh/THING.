begin;

create table public.game_prompts (
  id uuid primary key default gen_random_uuid(),
  game_type text not null check (game_type in ('same_brain', 'know_me', 'this_or_that', 'hot')),
  round_type text not null default 'standard',
  prompt_en text not null,
  prompt_es text not null,
  option_a_en text not null,
  option_a_es text not null,
  option_b_en text not null,
  option_b_es text not null,
  mood text not null default 'playful',
  context text not null default 'anywhere',
  intensity integer not null default 1 check (intensity between 1 and 3),
  tags text[] not null default '{}',
  adult boolean not null default false,
  reveal_style text not null default 'standard',
  active boolean not null default true,
  unique (game_type, prompt_en)
);

create table public.hangout_rounds (
  id uuid primary key default gen_random_uuid(),
  hangout_id uuid not null references public.hangouts(id) on delete cascade,
  round_number integer not null check (round_number between 1 and 8),
  prompt_id uuid not null references public.game_prompts(id) on delete restrict,
  state text not null default 'pending' check (state in ('pending', 'answering', 'revealed')),
  created_at timestamptz not null default now(),
  revealed_at timestamptz,
  unique (hangout_id, round_number),
  unique (hangout_id, prompt_id),
  check ((state = 'revealed') = (revealed_at is not null))
);

create table public.hangout_answers (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.hangout_rounds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answer_key text not null check (answer_key in ('a', 'b')),
  answered_at timestamptz not null default now(),
  unique (round_id, user_id)
);

create table public.hangout_results (
  hangout_id uuid primary key references public.hangouts(id) on delete cascade,
  game_type text not null check (game_type in ('same_brain', 'know_me', 'this_or_that', 'hot')),
  rounds_played integer not null check (rounds_played >= 0),
  result_json jsonb not null,
  completed_at timestamptz not null default now()
);
create index hangout_results_completed on public.hangout_results(completed_at desc);

create table public.thing_souvenirs (
  id uuid primary key default gen_random_uuid(),
  thing_id uuid not null references public.things(id) on delete cascade,
  souvenir_key text not null check (souvenir_key in ('FIRST_THOUGHT', 'SAME_BRAIN', 'LOCKED_IN', 'PERFECT_SYNC')),
  source_hangout_id uuid not null references public.hangouts(id) on delete restrict,
  unlocked_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}',
  unique (thing_id, souvenir_key)
);
create index thing_souvenirs_unlocked on public.thing_souvenirs(thing_id, unlocked_at);

alter table public.game_prompts enable row level security;
alter table public.hangout_rounds enable row level security;
alter table public.hangout_answers enable row level security;
alter table public.hangout_results enable row level security;
alter table public.thing_souvenirs enable row level security;

revoke all on public.game_prompts, public.hangout_rounds, public.hangout_answers,
  public.hangout_results, public.thing_souvenirs from public, anon, authenticated;
grant select on public.hangout_rounds, public.hangout_answers, public.hangout_results,
  public.thing_souvenirs to authenticated;

create policy hangout_rounds_select_members on public.hangout_rounds for select to authenticated
  using (exists (
    select 1 from public.hangouts h
    join public.hangout_members hm on hm.hangout_id = h.id
    where h.id = hangout_rounds.hangout_id and hm.user_id = (select auth.uid())
  ) and coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'false');

create policy hangout_answers_select_safe on public.hangout_answers for select to authenticated
  using (coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'false' and exists (
    select 1 from public.hangout_rounds r
    join public.hangout_members hm on hm.hangout_id = r.hangout_id
    where r.id = hangout_answers.round_id and hm.user_id = (select auth.uid())
      and (hangout_answers.user_id = (select auth.uid()) or r.state = 'revealed')
  ));

create policy hangout_results_select_members on public.hangout_results for select to authenticated
  using (exists (
    select 1 from public.hangouts h join public.hangout_members hm on hm.hangout_id = h.id
    where h.id = hangout_results.hangout_id and hm.user_id = (select auth.uid())
  ) and coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'false');

create policy thing_souvenirs_select_members on public.thing_souvenirs for select to authenticated
  using (public.is_active_thing_member(thing_id)
    and coalesce((select auth.jwt())->>'is_anonymous', 'false') = 'false');

insert into public.game_prompts
  (game_type, prompt_en, prompt_es, option_a_en, option_a_es, option_b_en, option_b_es, tags)
values
  ('same_brain','A free afternoon calls for…','Una tarde libre pide…','going out','salir','staying in','quedarse en','{plans}'),
  ('same_brain','Pick a snack personality.','Elige una personalidad de snack.','sweet','dulce','salty','salado','{food}'),
  ('same_brain','Best seat for the trip?','¿El mejor asiento para el viaje?','window','ventana','aisle','pasillo','{travel}'),
  ('same_brain','A message deserves…','Un mensaje merece…','a voice note','una nota de voz','a text','un texto','{chat}'),
  ('same_brain','Choose the weekend pace.','Elige el ritmo del fin de semana.','slow morning','mañana tranquila','early adventure','aventura temprano','{plans}'),
  ('same_brain','Which weather wins?','¿Qué clima gana?','rainy day','día de lluvia','sunny day','día soleado','{weather}'),
  ('same_brain','Movie-night essential?','¿Esencial para noche de pelis?','popcorn','palomitas','ice cream','helado','{food}'),
  ('same_brain','Pick a tiny luxury.','Elige un pequeño lujo.','fresh sheets','sábanas limpias','a long shower','un baño largo','{home}'),
  ('same_brain','The better surprise is…','La mejor sorpresa es…','a planned date','una cita planeada','a spontaneous trip','un viaje espontáneo','{plans}'),
  ('same_brain','Choose a soundtrack.','Elige un soundtrack.','old favorites','viejas favoritas','new discoveries','nuevos descubrimientos','{music}'),
  ('same_brain','For sharing food…','Para compartir comida…','order favorites','pedir favoritos','try something new','probar algo nuevo','{food}'),
  ('same_brain','The cozier light is…','La luz más acogedora es…','candles','velas','fairy lights','luces pequeñas','{home}'),
  ('same_brain','Pick a reset button.','Elige un botón de reinicio.','a walk','una caminata','a nap','una siesta','{wellbeing}'),
  ('same_brain','Photos are better…','Las fotos son mejores…','posed','posadas','candid','espontáneas','{memories}'),
  ('same_brain','Choose the first bite.','Elige el primer bocado.','fries','papas','dessert','postre','{food}'),
  ('same_brain','A perfect view has…','Una vista perfecta tiene…','city lights','luces de ciudad','open sky','cielo abierto','{travel}'),
  ('same_brain','Game night mood?','¿Mood de noche de juegos?','team game','juego en equipo','friendly rivalry','rivalidad amistosa','{games}'),
  ('same_brain','Pick a keepsake.','Elige un recuerdo.','printed photo','foto impresa','saved ticket','boleto guardado','{memories}'),
  ('same_brain','The better wake-up is…','Es mejor despertar con…','music','música','silence','silencio','{routine}'),
  ('same_brain','Choose a mini escape.','Elige una mini escapada.','bookstore','librería','coffee shop','cafetería','{plans}'),
  ('same_brain','For a long drive…','Para un viaje largo…','playlist','playlist','conversation','conversación','{travel}'),
  ('same_brain','Pick the celebration.','Elige la celebración.','big plans','planes grandes','small ritual','ritual pequeño','{plans}'),
  ('same_brain','Which note feels warmer?','¿Qué nota se siente más cálida?','handwritten','escrita a mano','surprise text','mensaje sorpresa','{chat}'),
  ('same_brain','The ideal breakfast is…','El desayuno ideal es…','sweet','dulce','savory','salado','{food}');

create function public.same_brain_snapshot(p_hangout_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.hangouts; current_round public.hangout_rounds; prompt public.game_prompts; payload jsonb;
begin
  select * into target from public.hangouts where id = p_hangout_id;
  if not found or target.game_type <> 'same_brain' or not exists(
    select 1 from public.hangout_members where hangout_id = target.id and user_id = actor
  ) then raise exception 'hangout_unavailable'; end if;

  select * into current_round from public.hangout_rounds
    where hangout_id = target.id and state = 'answering' order by round_number limit 1;
  if not found then
    select * into current_round from public.hangout_rounds
      where hangout_id = target.id and state = 'revealed' order by round_number desc limit 1;
  end if;
  if current_round.id is not null then select * into prompt from public.game_prompts where id = current_round.prompt_id; end if;

  select jsonb_build_object(
    'id', target.id, 'thing_id', target.thing_id, 'state', target.state,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('display_name', p.display_name) order by tm.seat), '[]'::jsonb)
      from public.hangout_members hm join public.thing_members tm on tm.thing_id = target.thing_id and tm.user_id = hm.user_id
      join public.profiles p on p.id = hm.user_id where hm.hangout_id = target.id),
    'round', case when current_round.id is null then null else jsonb_build_object(
      'id', current_round.id, 'number', current_round.round_number, 'state', current_round.state,
      'prompt_en', prompt.prompt_en, 'prompt_es', prompt.prompt_es,
      'option_a_en', prompt.option_a_en, 'option_a_es', prompt.option_a_es,
      'option_b_en', prompt.option_b_en, 'option_b_es', prompt.option_b_es,
      'answer_count', (select count(*) from public.hangout_answers where round_id = current_round.id),
      'own_answer', (select answer_key from public.hangout_answers where round_id = current_round.id and user_id = actor),
      'answers', case when current_round.state = 'revealed' then (select coalesce(jsonb_agg(
        jsonb_build_object('answer_key', a.answer_key, 'is_self', a.user_id = actor, 'display_name', p.display_name)
        order by (a.user_id = actor) desc), '[]'::jsonb)
        from public.hangout_answers a join public.profiles p on p.id = a.user_id where a.round_id = current_round.id) else '[]'::jsonb end
    ) end,
    'result', (select result_json from public.hangout_results where hangout_id = target.id)
  ) into payload;
  return payload;
end;
$$;

create function public.start_same_brain(p_hangout_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.hangouts; available integer;
begin
  select * into target from public.hangouts where id = p_hangout_id for update;
  if not found or target.game_type <> 'same_brain' or target.state not in ('setup','active')
    or not exists(select 1 from public.hangout_members where hangout_id = target.id and user_id = actor)
    or not exists(select 1 from public.things where id = target.thing_id and status = 'active')
    then raise exception 'hangout_unavailable'; end if;
  if target.state = 'active' then return; end if;
  select count(*) into available from public.game_prompts where game_type = 'same_brain' and active and not adult;
  if available < 8 then raise exception 'prompt_pack_unavailable'; end if;
  insert into public.hangout_rounds(hangout_id, round_number, prompt_id, state)
    select target.id, row_number() over (), id, case when row_number() over () = 1 then 'answering' else 'pending' end
    from (select id from public.game_prompts where game_type = 'same_brain' and active and not adult order by random() limit 8) chosen
    on conflict (hangout_id, round_number) do nothing;
  if (select count(*) from public.hangout_rounds where hangout_id = target.id) <> 8 then raise exception 'hangout_unavailable'; end if;
  update public.hangouts set state = 'active', started_at = coalesce(started_at, now()) where id = target.id;
end;
$$;

create function public.submit_same_brain_answer(p_hangout_id uuid, p_round_id uuid, p_answer_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.hangouts; target_round public.hangout_rounds;
begin
  if p_answer_key is null or p_answer_key not in ('a','b') then raise exception 'invalid_answer'; end if;
  select * into target from public.hangouts where id = p_hangout_id for update;
  if not found or target.game_type <> 'same_brain' or target.state <> 'active'
    or not exists(select 1 from public.things where id = target.thing_id and status = 'active')
    or not exists(select 1 from public.hangout_members where hangout_id = target.id and user_id = actor)
    then raise exception 'hangout_unavailable'; end if;
  select * into target_round from public.hangout_rounds where id = p_round_id and hangout_id = target.id for update;
  if not found or target_round.state <> 'answering' then raise exception 'round_unavailable'; end if;
  if exists(select 1 from public.hangout_answers where round_id = target_round.id and user_id = actor) then raise exception 'answer_locked'; end if;
  insert into public.hangout_answers(round_id, user_id, answer_key) values(target_round.id, actor, p_answer_key);
  if (select count(*) from public.hangout_answers where round_id = target_round.id) = 2 then
    update public.hangout_rounds set state = 'revealed', revealed_at = now() where id = target_round.id;
  end if;
end;
$$;

create function public.finish_same_brain_locked(p_hangout_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare target public.hangouts; rounds_count integer; matches_count integer; best_streak integer; payload jsonb;
begin
  select * into target from public.hangouts where id = p_hangout_id for update;
  if not found or target.game_type <> 'same_brain' then raise exception 'hangout_unavailable'; end if;
  select count(*) into rounds_count from public.hangout_rounds where hangout_id = target.id and state = 'revealed';
  if rounds_count <> 8 then raise exception 'round_unavailable'; end if;
  with outcomes as (
    select r.round_number, count(distinct a.answer_key) = 1 matched
    from public.hangout_rounds r join public.hangout_answers a on a.round_id = r.id
    where r.hangout_id = target.id group by r.id, r.round_number having count(*) = 2
  ), marked as (
    select *, sum(case when matched then 0 else 1 end) over(order by round_number) grp from outcomes
  )
  select count(*) filter(where matched), coalesce(max(run), 0) into matches_count, best_streak
  from marked left join (
    select grp, count(*)::integer run from marked where matched group by grp
  ) streaks using (grp);
  payload := jsonb_build_object('matches', matches_count, 'rounds', rounds_count,
    'match_rate', matches_count::numeric / rounds_count, 'best_match_streak', best_streak);
  insert into public.hangout_results(hangout_id, game_type, rounds_played, result_json)
    values(target.id, 'same_brain', rounds_count, payload)
    on conflict(hangout_id) do nothing;
  update public.hangouts set state = 'complete', completed_at = coalesce(completed_at, now()), result = payload where id = target.id;
  insert into public.thing_souvenirs(thing_id, souvenir_key, source_hangout_id, metadata_json)
    values(target.thing_id, 'FIRST_THOUGHT', target.id, payload) on conflict(thing_id, souvenir_key) do nothing;
  if best_streak >= 3 then insert into public.thing_souvenirs(thing_id, souvenir_key, source_hangout_id, metadata_json)
    values(target.thing_id, 'SAME_BRAIN', target.id, payload) on conflict(thing_id, souvenir_key) do nothing; end if;
  if best_streak >= 5 then insert into public.thing_souvenirs(thing_id, souvenir_key, source_hangout_id, metadata_json)
    values(target.thing_id, 'LOCKED_IN', target.id, payload) on conflict(thing_id, souvenir_key) do nothing; end if;
  if matches_count = 8 then insert into public.thing_souvenirs(thing_id, souvenir_key, source_hangout_id, metadata_json)
    values(target.thing_id, 'PERFECT_SYNC', target.id, payload) on conflict(thing_id, souvenir_key) do nothing; end if;
  return payload;
end;
$$;

create function public.advance_same_brain_round(p_hangout_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.hangouts; current_round public.hangout_rounds; next_id uuid;
begin
  select * into target from public.hangouts where id = p_hangout_id for update;
  if not found or target.game_type <> 'same_brain' or target.state not in ('active','complete')
    or not exists(select 1 from public.hangout_members where hangout_id = target.id and user_id = actor)
    then raise exception 'hangout_unavailable'; end if;
  if target.state = 'complete' then return; end if;
  if not exists(select 1 from public.things where id = target.thing_id and status = 'active') then raise exception 'hangout_unavailable'; end if;
  select * into current_round from public.hangout_rounds where hangout_id = target.id and state = 'revealed' order by round_number desc limit 1;
  if not found or exists(select 1 from public.hangout_rounds where hangout_id = target.id and state = 'answering') then raise exception 'round_unavailable'; end if;
  select id into next_id from public.hangout_rounds where hangout_id = target.id and round_number = current_round.round_number + 1 and state = 'pending';
  if next_id is not null then update public.hangout_rounds set state = 'answering' where id = next_id;
  else perform public.finish_same_brain_locked(target.id); end if;
end;
$$;

create function public.complete_same_brain(p_hangout_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.hangouts; existing jsonb;
begin
  select * into target from public.hangouts where id = p_hangout_id for update;
  if not found or target.game_type <> 'same_brain'
    or not exists(select 1 from public.hangout_members where hangout_id = target.id and user_id = actor)
    then raise exception 'hangout_unavailable'; end if;
  select result_json into existing from public.hangout_results where hangout_id = target.id;
  if existing is not null then return existing; end if;
  if not exists(select 1 from public.things where id = target.thing_id and status = 'active') then raise exception 'hangout_unavailable'; end if;
  return public.finish_same_brain_locked(target.id);
end;
$$;

create function public.space_snapshot(p_thing_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.things; payload jsonb;
begin
  select * into target from public.things where id = p_thing_id;
  if not found or not public.is_active_thing_member(target.id) then raise exception 'thing_unavailable'; end if;
  with completed_days as (
    select distinct (completed_at at time zone 'UTC')::date activity_date from public.hangouts
    where thing_id = target.id and state = 'complete' and completed_at is not null
  ), day_runs as (
    select activity_date, activity_date - row_number() over(order by activity_date)::integer grp from completed_days
  ), runs as (
    select min(activity_date) first_day, max(activity_date) last_day, count(*)::integer length from day_runs group by grp
  ), current_run as (
    select case when last_day >= (now() at time zone 'UTC')::date - 1 then length else 0 end length
    from runs order by last_day desc limit 1
  ), same_brain as (
    select count(*)::integer hangouts, coalesce(sum(rounds_played),0)::integer rounds,
      coalesce(sum((result_json->>'matches')::integer),0)::integer matches,
      coalesce(max((result_json->>'match_rate')::numeric),0) best_rate,
      coalesce(max((result_json->>'best_match_streak')::integer),0)::integer best_streak
    from public.hangout_results r join public.hangouts h on h.id = r.hangout_id
    where h.thing_id = target.id and r.game_type = 'same_brain' and h.state = 'complete'
  )
  select jsonb_build_object(
    'thing_id', target.id, 'status', target.status, 'charm_key', target.charm_key, 'color_key', target.color_key,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('display_name', p.display_name) order by m.seat), '[]'::jsonb)
      from public.thing_members m join public.profiles p on p.id = m.user_id where m.thing_id = target.id and m.status = 'active'),
    'total_completed_hangouts', (select count(*) from public.hangouts where thing_id = target.id and state = 'complete'),
    'current_streak', coalesce((select length from current_run),0),
    'best_streak', coalesce((select max(length) from runs),0),
    'same_brain', (select jsonb_build_object('hangouts', hangouts, 'rounds', rounds, 'matches', matches,
      'lifetime_match_rate', case when rounds = 0 then 0 else matches::numeric / rounds end,
      'best_session_match_rate', best_rate, 'best_match_streak', best_streak) from same_brain),
    'souvenirs', (select coalesce(jsonb_agg(jsonb_build_object('key', souvenir_key, 'unlocked_at', unlocked_at,
      'source_hangout_id', source_hangout_id) order by unlocked_at), '[]'::jsonb) from public.thing_souvenirs where thing_id = target.id)
  ) into payload;
  return payload;
end;
$$;

revoke all on function public.same_brain_snapshot(uuid), public.start_same_brain(uuid),
  public.submit_same_brain_answer(uuid, uuid, text), public.advance_same_brain_round(uuid),
  public.complete_same_brain(uuid), public.finish_same_brain_locked(uuid), public.space_snapshot(uuid)
  from public, anon, authenticated;
grant execute on function public.same_brain_snapshot(uuid), public.start_same_brain(uuid),
  public.submit_same_brain_answer(uuid, uuid, text), public.advance_same_brain_round(uuid),
  public.complete_same_brain(uuid), public.space_snapshot(uuid) to authenticated;

commit;
