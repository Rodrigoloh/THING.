begin;

alter table public.game_prompts add column stable_id text;
alter table public.game_prompts add column level text;
alter table public.game_prompts add column status text not null default 'draft';
alter table public.game_prompts add column reaction_type text not null default 'respond';
alter table public.game_prompts add constraint game_prompts_level_check
  check (level is null or level in ('flirty','bold','spicy','kitkat'));
alter table public.game_prompts add constraint game_prompts_status_check
  check (status in ('draft','approved','retired'));
alter table public.game_prompts add constraint game_prompts_reaction_type_check
  check (reaction_type in ('respond','use_it','move'));
create unique index game_prompts_stable_id_unique on public.game_prompts(stable_id);
create index game_prompts_runtime_pool on public.game_prompts(game_type,level,status,active,context);

-- Migration 008 shipped a deliberately small provisional Hot pack. Keep old
-- references valid, but make those rows ineligible for production runtime.
update public.game_prompts set active=false,status='draft'
where game_type='hot' and stable_id is null;
update public.game_prompts set status='approved' where game_type in ('same_brain','this_or_that');

-- Replace preference-like Know Me seeds with self-anchored discovery prompts.
update public.game_prompts set active=false,status='retired'
where game_type='know_me' and stable_id is null;
insert into public.game_prompts
  (stable_id,game_type,round_type,prompt_en,prompt_es,option_a_en,option_a_es,option_b_en,option_b_es,context,intensity,tags,status,active)
values
  ('KM-001','know_me','prediction','When I have had a terrible day, what do I actually want?','Cuando tuve un día terrible, ¿qué quiero de verdad?','space first','espacio primero','help me talk it out','ayúdame a hablarlo','anywhere',1,'{discovery,support}','approved',true),
  ('KM-002','know_me','prediction','When I am overwhelmed, what helps me first?','Cuando estoy abrumado, ¿qué me ayuda primero?','a clear plan','un plan claro','quiet company','compañía tranquila','anywhere',1,'{discovery,support}','approved',true),
  ('KM-003','know_me','prediction','What kind of compliment actually gets to me?','¿Qué tipo de cumplido sí me llega?','something specific','algo específico','something unexpected','algo inesperado','anywhere',1,'{discovery,affection}','approved',true),
  ('KM-004','know_me','prediction','With a completely free Sunday, what would I really do?','Con un domingo totalmente libre, ¿qué haría de verdad?','go somewhere','salir a algún lugar','disappear at home','desaparecer en casa','anywhere',1,'{discovery,routine}','approved',true),
  ('KM-005','know_me','prediction','When I am nervous, what do I usually do?','Cuando estoy nervioso, ¿qué suelo hacer?','talk more','hablar más','get quieter','quedarme más callado','anywhere',1,'{discovery,habits}','approved',true),
  ('KM-006','know_me','prediction','What small gesture do I remember for days?','¿Qué pequeño gesto recuerdo durante días?','a thoughtful message','un mensaje atento','help without asking','ayuda sin pedirla','anywhere',1,'{discovery,care}','approved',true),
  ('KM-007','know_me','prediction','When plans fall apart, what is my first instinct?','Cuando los planes fallan, ¿cuál es mi primer instinto?','make a new plan','hacer otro plan','see where it goes','ver qué pasa','anywhere',1,'{discovery,habits}','approved',true),
  ('KM-008','know_me','prediction','When I need reassurance, what works best on me?','Cuando necesito tranquilidad, ¿qué funciona mejor conmigo?','say it clearly','dímelo claro','stay close','quédate cerca','anywhere',1,'{discovery,support}','approved',true)
on conflict (stable_id) do update set
  prompt_en=excluded.prompt_en,prompt_es=excluded.prompt_es,option_a_en=excluded.option_a_en,
  option_a_es=excluded.option_a_es,option_b_en=excluded.option_b_en,option_b_es=excluded.option_b_es,
  tags=excluded.tags,status=excluded.status,active=excluded.active;

alter table public.things add column kitkat_discovered_at timestamptz;
alter table public.hangouts add column kitkat_first_discovery boolean not null default false;

create table public.hot_reveals (
  round_id uuid primary key references public.hangout_rounds(id) on delete cascade,
  hangout_id uuid not null references public.hangouts(id) on delete cascade,
  prompt_id uuid not null references public.game_prompts(id) on delete restrict,
  subject_user_id uuid not null references auth.users(id) on delete cascade,
  selected_option text not null check (selected_option in ('a','b')),
  revealed_at timestamptz not null default now()
);
create index hot_reveals_hangout on public.hot_reveals(hangout_id,revealed_at);

create table public.hot_reactions (
  round_id uuid primary key references public.hangout_rounds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_key text not null check (action_key in ('use_it','respond','skip')),
  reacted_at timestamptz not null default now()
);

create table public.know_me_explanations (
  round_id uuid primary key references public.hangout_rounds(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 140),
  created_at timestamptz not null default now()
);

alter table public.hot_reveals enable row level security;
alter table public.hot_reactions enable row level security;
alter table public.know_me_explanations enable row level security;
revoke all on public.hot_reveals,public.hot_reactions,public.know_me_explanations from public,anon,authenticated;
grant select on public.hot_reveals,public.hot_reactions,public.know_me_explanations to authenticated;

create policy hot_reveals_members on public.hot_reveals for select to authenticated using (
  coalesce((select auth.jwt())->>'is_anonymous','false')='false' and exists (
    select 1 from public.hangout_members hm where hm.hangout_id=hot_reveals.hangout_id and hm.user_id=(select auth.uid())
  )
);
create policy hot_reactions_members on public.hot_reactions for select to authenticated using (
  coalesce((select auth.jwt())->>'is_anonymous','false')='false' and exists (
    select 1 from public.hangout_rounds r join public.hangout_members hm on hm.hangout_id=r.hangout_id
    where r.id=hot_reactions.round_id and hm.user_id=(select auth.uid())
  )
);
create policy know_me_explanations_members on public.know_me_explanations for select to authenticated using (
  coalesce((select auth.jwt())->>'is_anonymous','false')='false' and exists (
    select 1 from public.hangout_rounds r join public.hangout_members hm on hm.hangout_id=r.hangout_id
    where r.id=know_me_explanations.round_id and hm.user_id=(select auth.uid())
  )
);

create or replace function public.start_choice_engine(p_hangout_id uuid,p_game_type text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.thing_account(); target public.hangouts; available integer; member_count integer;
begin
  select * into target from public.hangouts where id=p_hangout_id for update;
  if not found or target.game_type<>p_game_type or p_game_type not in ('know_me','this_or_that') or target.state not in ('setup','waiting','active')
    or not exists(select 1 from public.hangout_members where hangout_id=target.id and user_id=actor)
    or not exists(select 1 from public.things where id=target.thing_id and status='active') then raise exception 'hangout_unavailable'; end if;
  if target.state in ('waiting','active') then return; end if;
  select count(*) into available from public.game_prompts where game_type=p_game_type and active and status='approved';
  if available<8 then raise exception 'prompt_pack_unavailable'; end if;
  insert into public.hangout_rounds(hangout_id,round_number,prompt_id,state,subject_user_id)
    select target.id,chosen.n,chosen.id,case when chosen.n=1 then 'answering' else 'pending' end,
      case when p_game_type='know_me' then (select user_id from public.thing_members where thing_id=target.thing_id and status='active' and seat=case when chosen.n%2=1 then 1 else 2 end) end
    from (select id,row_number() over(order by md5(id::text||target.id::text))::integer n from public.game_prompts where game_type=p_game_type and active and status='approved' order by md5(id::text||target.id::text) limit 8) chosen
    on conflict(hangout_id,round_number) do nothing;
  if (select count(*) from public.hangout_rounds where hangout_id=target.id)<>8 then raise exception 'hangout_unavailable'; end if;
  select count(*) into member_count from public.hangout_members where hangout_id=target.id;
  update public.hangouts set state=case when member_count=2 then 'active' else 'waiting' end,started_at=coalesce(started_at,now()) where id=target.id;
end;
$$;

create or replace function public.choice_engine_snapshot(p_hangout_id uuid,p_game_type text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.thing_account(); target public.hangouts; current_round public.hangout_rounds; prompt public.game_prompts; payload jsonb; color text; subject_name text; predictor_name text;
begin
  select * into target from public.hangouts where id=p_hangout_id;
  if not found or target.game_type<>p_game_type or p_game_type not in ('know_me','this_or_that')
    or not exists(select 1 from public.hangout_members where hangout_id=target.id and user_id=actor) then raise exception 'hangout_unavailable'; end if;
  select color_key into color from public.things where id=target.thing_id;
  select * into current_round from public.hangout_rounds where hangout_id=target.id and state='answering' order by round_number limit 1;
  if not found then select * into current_round from public.hangout_rounds where hangout_id=target.id and state='revealed' order by round_number desc limit 1; end if;
  if current_round.id is not null then
    select * into prompt from public.game_prompts where id=current_round.prompt_id;
    if current_round.subject_user_id is not null then
      select display_name into subject_name from public.profiles where id=current_round.subject_user_id;
      select p.display_name into predictor_name from public.thing_members m join public.profiles p on p.id=m.user_id where m.thing_id=target.thing_id and m.status='active' and m.user_id<>current_round.subject_user_id;
    end if;
  end if;
  select jsonb_build_object('id',target.id,'thing_id',target.thing_id,'game_type',target.game_type,'state',target.state,'color_key',color,
    'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',p.display_name) order by m.seat),'[]'::jsonb) from public.thing_members m join public.profiles p on p.id=m.user_id where m.thing_id=target.thing_id and m.status='active'),
    'round',case when current_round.id is null then null else jsonb_build_object('id',current_round.id,'number',current_round.round_number,'state',current_round.state,
      'prompt_en',prompt.prompt_en,'prompt_es',prompt.prompt_es,'option_a_en',prompt.option_a_en,'option_a_es',prompt.option_a_es,'option_b_en',prompt.option_b_en,'option_b_es',prompt.option_b_es,
      'subject_name',subject_name,'predictor_name',predictor_name,'role',case when actor=current_round.subject_user_id then 'subject' when p_game_type='know_me' then 'predictor' else 'voter' end,
      'own_answer',(select answer_key from public.hangout_answers where round_id=current_round.id and user_id=actor),
      'answer_count',(select count(*) from public.hangout_answers where round_id=current_round.id),
      'answers',case when current_round.state='revealed' then (select coalesce(jsonb_agg(jsonb_build_object('answer_key',a.answer_key,'is_self',a.user_id=actor,'is_subject',a.user_id=current_round.subject_user_id,'display_name',p.display_name) order by (a.user_id=actor) desc),'[]'::jsonb) from public.hangout_answers a join public.profiles p on p.id=a.user_id where a.round_id=current_round.id) else '[]'::jsonb end,
      'explanation',(select body from public.know_me_explanations where round_id=current_round.id),
      'can_explain',p_game_type='know_me' and current_round.state='revealed' and actor=current_round.subject_user_id and not exists(select 1 from public.know_me_explanations where round_id=current_round.id)) end,
    'result',(select result_json from public.hangout_results where hangout_id=target.id)) into payload;
  return payload;
end;
$$;

create function public.submit_know_me_explanation(p_hangout_id uuid,p_round_id uuid,p_body text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.thing_account(); target_round public.hangout_rounds;
begin
  select r.* into target_round from public.hangout_rounds r join public.hangouts h on h.id=r.hangout_id
  where r.id=p_round_id and r.hangout_id=p_hangout_id and h.game_type='know_me' and h.state='active' for update of r;
  if not found or target_round.state<>'revealed' or target_round.subject_user_id<>actor then raise exception 'round_unavailable'; end if;
  if char_length(trim(p_body)) not between 1 and 140 then raise exception 'invalid_explanation'; end if;
  insert into public.know_me_explanations(round_id,user_id,body) values(target_round.id,actor,trim(p_body)) on conflict(round_id) do nothing;
end;
$$;

create or replace function public.hot_add_prompt_locked(p_hangout_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare target public.hangouts; prompt_id uuid; next_number integer; expected_prefix text;
begin
  select * into target from public.hangouts where id=p_hangout_id for update;
  expected_prefix:=case target.hot_level when 'flirty' then 'HT-F-' when 'bold' then 'HT-B-' when 'spicy' then 'HT-S-' when 'kitkat' then 'HT-K-' end;
  if expected_prefix is null then raise exception 'prompt_pack_unavailable'; end if;
  select p.id into prompt_id from public.game_prompts p
  where p.game_type='hot' and p.active and p.status='approved' and p.level=target.hot_level and p.stable_id like expected_prefix||'%'
    and p.context in ('both',target.context)
    and not exists(select 1 from public.hangout_rounds r where r.hangout_id=target.id and r.prompt_id=p.id)
    and not exists(
      select 1 from public.hangout_rounds recent_round
      where recent_round.prompt_id=p.id and recent_round.hangout_id in (
        select h.id from public.hangouts h where h.thing_id=target.thing_id and h.game_type='hot' and h.state='complete' order by h.completed_at desc limit 2
      )
    )
  order by md5(p.id::text||target.id::text||coalesce((select max(round_number)::text from public.hangout_rounds where hangout_id=target.id),'0')) limit 1;
  if prompt_id is null then
    select p.id into prompt_id from public.game_prompts p
    where p.game_type='hot' and p.active and p.status='approved' and p.level=target.hot_level and p.stable_id like expected_prefix||'%'
      and p.context in ('both',target.context)
      and not exists(select 1 from public.hangout_rounds r where r.hangout_id=target.id and r.prompt_id=p.id)
    order by md5(p.id::text||target.id::text||coalesce((select max(round_number)::text from public.hangout_rounds where hangout_id=target.id),'0')) limit 1;
  end if;
  if prompt_id is null then raise exception 'prompt_pack_unavailable'; end if;
  select coalesce(max(round_number),0)+1 into next_number from public.hangout_rounds where hangout_id=target.id;
  insert into public.hangout_rounds(hangout_id,round_number,prompt_id,state,level,subject_user_id)
  values(target.id,next_number,prompt_id,'answering',target.hot_level,
    (select user_id from public.thing_members where thing_id=target.thing_id and status='active' and seat=case when next_number%2=1 then 1 else 2 end));
  update public.hangouts set hot_notice=null where id=target.id;
  return prompt_id;
end;
$$;

create or replace function public.hot_snapshot(p_hangout_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.thing_account(); target public.hangouts; current_round public.hangout_rounds; prompt public.game_prompts; color text; payload jsonb; unlocked boolean; subject_name text; reactor_name text; callback jsonb;
begin
  select * into target from public.hangouts where id=p_hangout_id;
  if not found or target.game_type<>'hot' or not exists(select 1 from public.hangout_members where hangout_id=target.id and user_id=actor) then raise exception 'hangout_unavailable'; end if;
  select color_key into color from public.things where id=target.thing_id;
  select count(*)>=3 into unlocked from public.hangout_results r join public.hangouts h on h.id=r.hangout_id where h.thing_id=target.thing_id and r.game_type='hot' and h.state='complete' and coalesce((r.result_json->>'reached_spicy')::boolean,false);
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
    'kitkat_unlocked',unlocked,'kitkat_first_discovery',target.kitkat_first_discovery,'completed_prompts',(select count(*) from public.hangout_rounds where hangout_id=target.id and state='revealed' and not skipped),
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

create or replace function public.submit_hot_round(p_hangout_id uuid,p_round_id uuid,p_answer_key text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.thing_account(); target public.hangouts; target_round public.hangout_rounds; prompt public.game_prompts; subject_answer text; answer_count integer;
begin
  if p_answer_key not in ('a','b') then raise exception 'invalid_answer'; end if;
  select * into target from public.hangouts where id=p_hangout_id for update;
  select * into target_round from public.hangout_rounds where id=p_round_id and hangout_id=p_hangout_id for update;
  if target.id is null or target.game_type<>'hot' or target.state<>'active' or target.hot_gate is not null or target_round.id is null or target_round.state<>'answering'
    or not exists(select 1 from public.hangout_members where hangout_id=target.id and user_id=actor) then raise exception 'round_unavailable'; end if;
  select * into prompt from public.game_prompts where id=target_round.prompt_id;
  select answer_key into subject_answer from public.hangout_answers where round_id=target_round.id and user_id=target_round.subject_user_id;
  if actor=target_round.subject_user_id then
    if subject_answer is not null then raise exception 'answer_locked'; end if;
  elsif prompt.round_type<>'guess' or subject_answer is null then raise exception 'round_unavailable';
  end if;
  insert into public.hangout_answers(round_id,user_id,answer_key) values(target_round.id,actor,p_answer_key) on conflict(round_id,user_id) do nothing;
  if (select answer_key from public.hangout_answers where round_id=target_round.id and user_id=actor)<>p_answer_key then raise exception 'answer_locked'; end if;
  select count(*) into answer_count from public.hangout_answers where round_id=target_round.id;
  if (prompt.round_type='guess' and answer_count=2) or (prompt.round_type<>'guess' and actor=target_round.subject_user_id) then
    update public.hangout_rounds set state='revealed',revealed_at=now() where id=target_round.id;
    insert into public.hot_reveals(round_id,hangout_id,prompt_id,subject_user_id,selected_option)
      values(target_round.id,target.id,target_round.prompt_id,target_round.subject_user_id,(select answer_key from public.hangout_answers where round_id=target_round.id and user_id=target_round.subject_user_id)) on conflict do nothing;
  end if;
end;
$$;

create function public.submit_hot_reaction(p_hangout_id uuid,p_round_id uuid,p_action_key text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.thing_account(); target public.hangouts; target_round public.hangout_rounds;
begin
  if p_action_key not in ('use_it','respond','skip') then raise exception 'invalid_answer'; end if;
  select * into target from public.hangouts where id=p_hangout_id for update;
  select * into target_round from public.hangout_rounds where id=p_round_id and hangout_id=p_hangout_id for update;
  if target.id is null or target.game_type<>'hot' or target.state<>'active' or target_round.id is null or target_round.state<>'revealed' or target_round.skipped
    or actor=target_round.subject_user_id or not exists(select 1 from public.hangout_members where hangout_id=target.id and user_id=actor) then raise exception 'round_unavailable'; end if;
  insert into public.hot_reactions(round_id,user_id,action_key) values(target_round.id,actor,p_action_key) on conflict(round_id) do nothing;
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
    select count(*)>=3 into unlocked from public.hangout_results r join public.hangouts h on h.id=r.hangout_id where h.thing_id=target.thing_id and r.game_type='hot' and h.state='complete' and coalesce((r.result_json->>'reached_spicy')::boolean,false);
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
      update public.things set kitkat_discovered_at=now() where id=target.thing_id and kitkat_discovered_at is null returning true into first_discovery;
    end if;
    update public.hangout_level_gates set resolved=true,accepted=both_accepted,resolved_at=now() where hangout_id=target.id and target_level=gate_level;
    update public.hangouts set hot_level=case when both_accepted then gate_level else hot_level end,hot_gate=null,hot_notice=case when both_accepted then 'level_up' else 'staying_here' end,
      kitkat_first_discovery=kitkat_first_discovery or (gate_level='kitkat' and both_accepted and first_discovery) where id=target.id;
    perform public.hot_add_prompt_locked(target.id);
    update public.hangouts set hot_notice=case when both_accepted then 'level_up' else 'staying_here' end where id=target.id;
  end if;
end;
$$;

revoke all on function public.submit_know_me_explanation(uuid,uuid,text),public.submit_hot_reaction(uuid,uuid,text) from public,anon;
grant execute on function public.submit_know_me_explanation(uuid,uuid,text),public.submit_hot_reaction(uuid,uuid,text) to authenticated;

commit;
