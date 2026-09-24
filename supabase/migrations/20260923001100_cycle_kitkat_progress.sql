begin;

-- Migration 010 was already applied before repeatable KitKat progression was
-- introduced. Add only that unapplied state and preserve all Social Hub data.
alter table public.things add column if not exists kitkat_progress smallint;
alter table public.things alter column kitkat_progress set default 0;

-- Backfill the current cycle from completed Hot Hangouts. A completed KitKat
-- session consumed the prior cycle; only later Spicy-reaching sessions count.
update public.things t set kitkat_progress = case
  when exists(
    select 1 from public.hangouts h
    where h.thing_id=t.id and h.game_type='hot' and h.state<>'complete' and h.hot_level='kitkat'
  ) then 0
  else least(3, (
    select count(*)::integer
    from public.hangout_results r join public.hangouts h on h.id=r.hangout_id
    where h.thing_id=t.id and h.state='complete' and r.game_type='hot'
      and coalesce((r.result_json->>'reached_spicy')::boolean,false)
      and not coalesce((r.result_json->>'reached_kitkat')::boolean,false)
      and h.completed_at > coalesce((
        select max(kh.completed_at)
        from public.hangout_results kr join public.hangouts kh on kh.id=kr.hangout_id
        where kh.thing_id=t.id and kh.state='complete' and kr.game_type='hot'
          and coalesce((kr.result_json->>'reached_kitkat')::boolean,false)
      ),'-infinity'::timestamptz)
  ))
end;

alter table public.things alter column kitkat_progress set not null;
do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.things'::regclass and conname='things_kitkat_progress_check'
  ) then
    alter table public.things add constraint things_kitkat_progress_check
      check (kitkat_progress between 0 and 3);
  end if;
end;
$$;

create or replace function public.hot_snapshot(p_hangout_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.thing_account(); target public.hangouts; current_round public.hangout_rounds; prompt public.game_prompts; color text; payload jsonb; progress smallint; subject_name text; reactor_name text; callback jsonb;
begin
  select * into target from public.hangouts where id=p_hangout_id;
  if not found or target.game_type<>'hot' or not exists(select 1 from public.hangout_members where hangout_id=target.id and user_id=actor) then raise exception 'hangout_unavailable'; end if;
  select color_key,kitkat_progress into color,progress from public.things where id=target.thing_id;
  select * into current_round from public.hangout_rounds where hangout_id=target.id and state='answering' order by round_number desc limit 1;
  if not found then select * into current_round from public.hangout_rounds where hangout_id=target.id and state='revealed' order by round_number desc limit 1; end if;
  if current_round.id is not null then
    select * into prompt from public.game_prompts where id=current_round.prompt_id;
    select display_name into subject_name from public.profiles where id=current_round.subject_user_id;
    select p.display_name into reactor_name from public.thing_members m join public.profiles p on p.id=m.user_id where m.thing_id=target.thing_id and m.status='active' and m.user_id<>current_round.subject_user_id;
    if current_round.round_number>3 and current_round.round_number%4=0 then
      select jsonb_build_object('subject_name',p.display_name,'selected_option',hr.selected_option,
        'option_en',case hr.selected_option when 'a' then gp.option_a_en else gp.option_b_en end,
        'option_es',case hr.selected_option when 'a' then gp.option_a_es else gp.option_b_es end)
      into callback from public.hot_reveals hr join public.profiles p on p.id=hr.subject_user_id join public.game_prompts gp on gp.id=hr.prompt_id
      where hr.hangout_id=target.id and hr.round_id<>current_round.id order by hr.revealed_at desc limit 1;
    end if;
  end if;
  select jsonb_build_object('id',target.id,'thing_id',target.thing_id,'state',target.state,'color_key',color,'context',target.context,'current_level',target.hot_level,'notice',target.hot_notice,
    'kitkat_unlocked',progress=3,'kitkat_progress',progress,'kitkat_first_discovery',target.kitkat_first_discovery,'completed_prompts',(select count(*) from public.hangout_rounds where hangout_id=target.id and state='revealed' and not skipped),
    'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',p.display_name) order by m.seat),'[]'::jsonb) from public.thing_members m join public.profiles p on p.id=m.user_id where m.thing_id=target.thing_id and m.status='active'),
    'gate',case when target.hot_gate is null then null else jsonb_build_object('target_level',target.hot_gate,'own_vote',(select accepted from public.hangout_level_votes where hangout_id=target.id and target_level=target.hot_gate and user_id=actor),'votes_cast',(select count(*) from public.hangout_level_votes where hangout_id=target.id and target_level=target.hot_gate)) end,
    'round',case when current_round.id is null then null else jsonb_build_object('id',current_round.id,'number',current_round.round_number,'state',current_round.state,'level',current_round.level,'skipped',current_round.skipped,'round_type',prompt.round_type,'reaction_type',prompt.reaction_type,
      'prompt_id',prompt.stable_id,'prompt_en',prompt.prompt_en,'prompt_es',prompt.prompt_es,'option_a_en',prompt.option_a_en,'option_a_es',prompt.option_a_es,'option_b_en',prompt.option_b_en,'option_b_es',prompt.option_b_es,
      'subject_name',subject_name,'reactor_name',reactor_name,'role',case when actor=current_round.subject_user_id then 'subject' else 'reactor' end,
      'own_answer',(select answer_key from public.hangout_answers where round_id=current_round.id and user_id=actor),'answer_count',(select count(*) from public.hangout_answers where round_id=current_round.id),
      'can_answer',current_round.state='answering' and (actor=current_round.subject_user_id or (prompt.round_type='guess' and actor<>current_round.subject_user_id and exists(select 1 from public.hangout_answers where round_id=current_round.id and user_id=current_round.subject_user_id))),
      'answers',case when current_round.state='revealed' and not current_round.skipped then (select coalesce(jsonb_agg(jsonb_build_object('answer_key',a.answer_key,'is_self',a.user_id=actor,'is_subject',a.user_id=current_round.subject_user_id,'display_name',p.display_name) order by (a.user_id=current_round.subject_user_id) desc),'[]'::jsonb) from public.hangout_answers a join public.profiles p on p.id=a.user_id where a.round_id=current_round.id) else '[]'::jsonb end,
      'needs_reaction',current_round.state='revealed' and not current_round.skipped and not exists(select 1 from public.hot_reactions where round_id=current_round.id),
      'can_react',current_round.state='revealed' and not current_round.skipped and actor<>current_round.subject_user_id and not exists(select 1 from public.hot_reactions where round_id=current_round.id),
      'reaction',(select action_key from public.hot_reactions where round_id=current_round.id),'callback',callback) end,
    'result',(select result_json from public.hangout_results where hangout_id=target.id)) into payload;
  return payload;
end;
$$;

create or replace function public.advance_hot(p_hangout_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.thing_account(); target public.hangouts; current_round public.hangout_rounds; level_count integer; gate_target text; unlocked boolean;
begin
  select * into target from public.hangouts where id=p_hangout_id for update;
  if not found or target.game_type<>'hot' or target.state not in ('active','complete') or not exists(select 1 from public.hangout_members where hangout_id=target.id and user_id=actor) then raise exception 'hangout_unavailable'; end if;
  if target.state='complete' then return; end if;
  if target.hot_gate is not null then raise exception 'round_unavailable'; end if;
  select * into current_round from public.hangout_rounds where hangout_id=target.id and state='revealed' order by round_number desc limit 1;
  if not found or exists(select 1 from public.hangout_rounds where hangout_id=target.id and state='answering') then raise exception 'round_unavailable'; end if;
  if not current_round.skipped and not exists(select 1 from public.hot_reactions where round_id=current_round.id) then raise exception 'round_unavailable'; end if;
  select count(*) into level_count from public.hangout_rounds where hangout_id=target.id and state='revealed' and not skipped and level=target.hot_level;
  if target.hot_level='flirty' and level_count>=2 and not exists(select 1 from public.hangout_level_gates where hangout_id=target.id and target_level='bold') then gate_target:='bold';
  elsif target.hot_level='bold' and level_count>=2 and not exists(select 1 from public.hangout_level_gates where hangout_id=target.id and target_level='spicy') then gate_target:='spicy';
  elsif target.hot_level='spicy' and level_count>=2 and not exists(select 1 from public.hangout_level_gates where hangout_id=target.id and target_level='kitkat') then
    select kitkat_progress=3 into unlocked from public.things where id=target.thing_id;
    if unlocked then
      if not exists(select 1 from public.game_prompts p where p.game_type='hot' and p.level='kitkat' and p.status='approved' and p.active and p.stable_id like 'HT-K-%' and p.context in ('both',target.context)) then raise exception 'prompt_pack_unavailable'; end if;
      gate_target:='kitkat';
    end if;
  end if;
  if gate_target is not null then
    insert into public.hangout_level_gates(hangout_id,target_level) values(target.id,gate_target);
    update public.hangouts set hot_gate=gate_target,hot_notice=null where id=target.id;
  else perform public.hot_add_prompt_locked(target.id); end if;
end;
$$;

create or replace function public.submit_hot_escalation(p_hangout_id uuid,p_accept boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.thing_account(); target public.hangouts; vote_count integer; both_accepted boolean; gate_level text; first_discovery boolean:=false;
begin
  select * into target from public.hangouts where id=p_hangout_id for update;
  if not found or target.game_type<>'hot' or target.state<>'active' or target.hot_gate is null or not exists(select 1 from public.hangout_members where hangout_id=target.id and user_id=actor) then raise exception 'hangout_unavailable'; end if;
  gate_level:=target.hot_gate;
  insert into public.hangout_level_votes(hangout_id,target_level,user_id,accepted) values(target.id,gate_level,actor,p_accept) on conflict do nothing;
  select count(*),bool_and(v.accepted) into vote_count,both_accepted from public.hangout_level_votes v where v.hangout_id=target.id and v.target_level=gate_level;
  if vote_count=2 then
    if both_accepted and gate_level='kitkat' then
      if not exists(select 1 from public.game_prompts p where p.game_type='hot' and p.level='kitkat' and p.status='approved' and p.active and p.stable_id like 'HT-K-%' and p.context in ('both',target.context)) then raise exception 'prompt_pack_unavailable'; end if;
      select kitkat_discovered_at is null into first_discovery from public.things where id=target.thing_id for update;
      update public.things set kitkat_progress=0,kitkat_discovered_at=coalesce(kitkat_discovered_at,now()) where id=target.thing_id;
    end if;
    update public.hangout_level_gates set resolved=true,accepted=both_accepted,resolved_at=now() where hangout_id=target.id and target_level=gate_level;
    update public.hangouts set hot_level=case when both_accepted then gate_level else hot_level end,hot_gate=null,hot_notice=case when both_accepted then 'level_up' else 'staying_here' end,
      kitkat_first_discovery=kitkat_first_discovery or (gate_level='kitkat' and both_accepted and first_discovery) where id=target.id;
    if both_accepted and gate_level='bold' then insert into public.thing_souvenirs(thing_id,souvenir_key,source_hangout_id) values(target.thing_id,'TURNED_UP',target.id) on conflict(thing_id,souvenir_key) do nothing; end if;
    if both_accepted and gate_level='spicy' then insert into public.thing_souvenirs(thing_id,souvenir_key,source_hangout_id) values(target.thing_id,'AFTER_HOURS',target.id) on conflict(thing_id,souvenir_key) do nothing; end if;
    if both_accepted and gate_level='kitkat' then insert into public.thing_souvenirs(thing_id,souvenir_key,source_hangout_id) values(target.thing_id,'KITKAT',target.id) on conflict(thing_id,souvenir_key) do nothing; end if;
    perform public.hot_add_prompt_locked(target.id);
    update public.hangouts set hot_notice=case when both_accepted then 'level_up' else 'staying_here' end where id=target.id;
  end if;
end;
$$;

create or replace function public.complete_hot(p_hangout_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.thing_account(); target public.hangouts; completed integer; payload jsonb; reached_spicy boolean; reached_kitkat boolean;
begin
  select * into target from public.hangouts where id=p_hangout_id for update;
  if not found or target.game_type<>'hot' or target.state not in ('active','complete') or not exists(select 1 from public.hangout_members where hangout_id=target.id and user_id=actor) then raise exception 'hangout_unavailable'; end if;
  if target.state='complete' then return (select result_json from public.hangout_results where hangout_id=target.id); end if;
  select count(*) into completed from public.hangout_rounds where hangout_id=target.id and state='revealed' and not skipped;
  if completed<1 then raise exception 'round_unavailable'; end if;
  reached_spicy:=exists(select 1 from public.hangout_rounds where hangout_id=target.id and level in ('spicy','kitkat')) or target.hot_level in ('spicy','kitkat');
  reached_kitkat:=exists(select 1 from public.hangout_rounds where hangout_id=target.id and level='kitkat') or target.hot_level='kitkat';
  payload:=jsonb_build_object('prompts_completed',completed,'highest_level',target.hot_level,'context',target.context,'reached_spicy',reached_spicy,'reached_kitkat',reached_kitkat);
  insert into public.hangout_results(hangout_id,game_type,rounds_played,result_json) values(target.id,'hot',completed,payload) on conflict(hangout_id) do nothing;
  update public.hangouts set state='complete',completed_at=coalesce(completed_at,now()),result=payload,hot_gate=null where id=target.id;
  -- The Hangout that consumes a KitKat cycle began before the reset, so it is
  -- not one of the three new qualifying Hangouts for the next cycle.
  if reached_spicy and not reached_kitkat then
    update public.things set kitkat_progress=least(3,kitkat_progress+1) where id=target.thing_id;
  end if;
  insert into public.thing_souvenirs(thing_id,souvenir_key,source_hangout_id,metadata_json) values(target.thing_id,'HEAT_CHECK',target.id,payload) on conflict(thing_id,souvenir_key) do nothing;
  return payload;
end;
$$;

create or replace function public.space_snapshot(p_thing_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.thing_account(); target public.things; payload jsonb;
begin
  select * into target from public.things where id=p_thing_id;
  if not found or not public.is_active_thing_member(target.id) then raise exception 'thing_unavailable'; end if;
  with completed_days as (
    select distinct (completed_at at time zone 'UTC')::date activity_date from public.hangouts where thing_id=target.id and state='complete' and completed_at is not null
  ), day_runs as (select activity_date,activity_date-row_number() over(order by activity_date)::integer grp from completed_days),
  runs as (select min(activity_date) first_day,max(activity_date) last_day,count(*)::integer length from day_runs group by grp),
  current_run as (select case when last_day>=(now() at time zone 'UTC')::date-1 then length else 0 end length from runs order by last_day desc limit 1),
  sb as (select count(*)::integer hangouts,coalesce(sum(rounds_played),0)::integer rounds,coalesce(sum((result_json->>'matches')::integer),0)::integer matches,coalesce(max((result_json->>'match_rate')::numeric),0) best_rate,coalesce(max((result_json->>'best_match_streak')::integer),0)::integer best_streak from public.hangout_results r join public.hangouts h on h.id=r.hangout_id where h.thing_id=target.id and r.game_type='same_brain' and h.state='complete'),
  km as (select coalesce(sum(rounds_played),0)::integer predictions,coalesce(sum((result_json->>'correct_predictions')::integer),0)::integer correct,coalesce(max((result_json->>'correct_predictions')::numeric/nullif(rounds_played,0)),0) best_rate from public.hangout_results r join public.hangouts h on h.id=r.hangout_id where h.thing_id=target.id and r.game_type='know_me' and h.state='complete'),
  tt as (select coalesce(sum(rounds_played),0)::integer rounds,coalesce(sum((result_json->>'agreements')::integer),0)::integer agreements from public.hangout_results r join public.hangouts h on h.id=r.hangout_id where h.thing_id=target.id and r.game_type='this_or_that' and h.state='complete'),
  hot as (select count(*)::integer hangouts,count(*) filter(where coalesce((result_json->>'reached_spicy')::boolean,false))::integer spicy_hangouts,max(case result_json->>'highest_level' when 'kitkat' then 4 when 'spicy' then 3 when 'bold' then 2 when 'flirty' then 1 else 0 end)::integer highest_rank from public.hangout_results r join public.hangouts h on h.id=r.hangout_id where h.thing_id=target.id and r.game_type='hot' and h.state='complete')
  select jsonb_build_object('thing_id',target.id,'status',target.status,'charm_key',target.charm_key,'color_key',target.color_key,
    'members',(select coalesce(jsonb_agg(jsonb_build_object('display_name',p.display_name) order by m.seat),'[]'::jsonb) from public.thing_members m join public.profiles p on p.id=m.user_id where m.thing_id=target.id and m.status='active'),
    'total_completed_hangouts',(select count(*) from public.hangouts where thing_id=target.id and state='complete'),'current_streak',coalesce((select length from current_run),0),'best_streak',coalesce((select max(length) from runs),0),
    'same_brain',(select jsonb_build_object('hangouts',hangouts,'rounds',rounds,'matches',matches,'lifetime_match_rate',case when rounds=0 then 0 else matches::numeric/rounds end,'best_session_match_rate',best_rate,'best_match_streak',best_streak) from sb),
    'know_me',(select jsonb_build_object('predictions',predictions,'correct',correct,'accuracy',case when predictions=0 then 0 else correct::numeric/predictions end,'best_session_rate',best_rate) from km),
    'this_or_that',(select jsonb_build_object('rounds',rounds,'agreements',agreements,'agreement_rate',case when rounds=0 then 0 else agreements::numeric/rounds end) from tt),
    'hot',(select jsonb_build_object('hangouts',hangouts,'spicy_hangouts',spicy_hangouts,'highest_level',case highest_rank when 4 then 'kitkat' when 3 then 'spicy' when 2 then 'bold' when 1 then 'flirty' else null end,'kitkat_progress',target.kitkat_progress,'kitkat_unlocked',target.kitkat_progress=3) from hot),
    'souvenirs',(select coalesce(jsonb_agg(jsonb_build_object('key',souvenir_key,'unlocked_at',unlocked_at,'source_hangout_id',source_hangout_id) order by unlocked_at),'[]'::jsonb) from public.thing_souvenirs where thing_id=target.id)) into payload;
  return payload;
end;
$$;

commit;
