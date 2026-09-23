begin;

alter table public.things add column nickname text
  check (nickname is null or (nickname = btrim(nickname) and char_length(nickname) between 1 and 30 and nickname !~ '[[:cntrl:]]'));

alter table public.thing_charm_choices drop constraint if exists thing_charm_choices_charm_key_check;
alter table public.thing_charm_choices add constraint thing_charm_choices_charm_key_check
  check (charm_key in ('clover','cherry','moon','spark','flame','heart','dice','eye','mushroom','cloud','lightning','planet'));
alter table public.current_charm_proposals drop constraint if exists current_charm_proposals_charm_key_check;
alter table public.current_charm_proposals add constraint current_charm_proposals_charm_key_check
  check (charm_key in ('clover','cherry','moon','spark','flame','heart','dice','eye','mushroom','cloud','lightning','planet'));

alter table public.thing_souvenirs drop constraint if exists thing_souvenirs_souvenir_key_check;
alter table public.thing_souvenirs add constraint thing_souvenirs_souvenir_key_check
  check (souvenir_key in ('FIRST_THOUGHT','SAME_BRAIN','LOCKED_IN','PERFECT_SYNC','HEAT_CHECK','TURNED_UP','AFTER_HOURS','KITKAT'));

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thing_id uuid not null references public.things(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  body text not null check (body = btrim(body) and char_length(body) between 1 and 2000 and body !~ '[[:cntrl:]]'),
  created_at timestamptz not null default now()
);
create index chat_messages_thing_time on public.chat_messages(thing_id, created_at, id);
alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from public, anon, authenticated;
grant select, insert on public.chat_messages to authenticated;
create policy chat_messages_select_members on public.chat_messages for select to authenticated
  using (public.is_active_thing_member(thing_id));
create policy chat_messages_insert_members on public.chat_messages for insert to authenticated
  with check (author_id = auth.uid() and public.is_active_thing_member(thing_id)
    and exists(select 1 from public.things t where t.id=thing_id and t.status='active'));

create table public.moments (
  id uuid primary key default gen_random_uuid(),
  thing_id uuid not null references public.things(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  storage_path text not null unique,
  caption text check (caption is null or (caption = btrim(caption) and char_length(caption) between 1 and 140 and caption !~ '[[:cntrl:]]')),
  created_at timestamptz not null default now(),
  check (storage_path like thing_id::text || '/' || author_id::text || '/%')
);
create index moments_thing_time on public.moments(thing_id, created_at desc, id);
alter table public.moments enable row level security;
revoke all on public.moments from public, anon, authenticated;
grant select, insert, delete on public.moments to authenticated;
create policy moments_select_members on public.moments for select to authenticated
  using (public.is_active_thing_member(thing_id));
create policy moments_insert_members on public.moments for insert to authenticated
  with check (author_id=auth.uid() and public.is_active_thing_member(thing_id)
    and exists(select 1 from public.things t where t.id=thing_id and t.status='active'));
create policy moments_delete_author on public.moments for delete to authenticated
  using (author_id=auth.uid() and public.is_active_thing_member(thing_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('thing-moments','thing-moments',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy thing_moments_storage_read on storage.objects for select to authenticated
  using (bucket_id='thing-moments' and exists(
    select 1 from public.thing_members m where m.thing_id::text=split_part(name,'/',1)
      and m.user_id=auth.uid() and m.status='active'));
create policy thing_moments_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id='thing-moments' and split_part(name,'/',2)=auth.uid()::text and exists(
    select 1 from public.thing_members m join public.things t on t.id=m.thing_id
    where m.thing_id::text=split_part(name,'/',1) and m.user_id=auth.uid() and m.status='active' and t.status='active'));
create policy thing_moments_storage_delete on storage.objects for delete to authenticated
  using (bucket_id='thing-moments' and split_part(name,'/',2)=auth.uid()::text and exists(
    select 1 from public.thing_members m where m.thing_id::text=split_part(name,'/',1)
      and m.user_id=auth.uid() and m.status='active'));

create function public.update_thing_nickname(p_thing_id uuid,p_nickname text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.thing_account(); normalized text:=nullif(btrim(p_nickname),'');
begin
  if normalized is not null and (char_length(normalized)>30 or normalized~'[[:cntrl:]]') then raise exception 'invalid_nickname'; end if;
  update public.things set nickname=normalized where id=p_thing_id and status='active' and public.is_active_thing_member(id);
  if not found then raise exception 'thing_unavailable'; end if;
end;
$$;

create or replace function public.propose_thing_charm(p_thing_id uuid,p_expected_version integer,p_charm text) returns integer
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.thing_account(); target public.things; proposal public.current_charm_proposals; next_version integer;
begin
  select * into target from public.things where id=p_thing_id for update;
  if not found or target.status not in ('pending_charm','active') or not public.is_active_thing_member(p_thing_id) then raise exception 'thing_unavailable'; end if;
  if p_charm is null or p_charm not in ('clover','cherry','moon','spark','flame','heart','dice','eye','mushroom','cloud','lightning','planet') then raise exception 'invalid_charm'; end if;
  if (select count(*) from public.thing_members where thing_id=p_thing_id and status='active')<>2 then raise exception 'thing_unavailable'; end if;
  select * into proposal from public.current_charm_proposals where thing_id=p_thing_id;
  if found then
    if p_expected_version is distinct from proposal.proposal_version then raise exception 'proposal_changed'; end if;
    if proposal.proposed_by=actor then raise exception 'own_proposal'; end if;
    next_version:=proposal.proposal_version+1;
    update public.current_charm_proposals set charm_key=p_charm,proposed_by=actor,proposal_version=next_version,updated_at=now() where thing_id=p_thing_id;
  else
    if p_expected_version is distinct from 0 then raise exception 'proposal_changed'; end if;
    next_version:=1;
    insert into public.current_charm_proposals(thing_id,charm_key,proposed_by,proposal_version) values(p_thing_id,p_charm,actor,next_version);
  end if;
  return next_version;
end;
$$;

create or replace function public.accept_thing_charm(p_thing_id uuid,p_expected_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.thing_account(); target public.things; proposal public.current_charm_proposals; derived_color text;
begin
  select * into target from public.things where id=p_thing_id for update;
  if not found or target.status not in ('pending_charm','active') or not public.is_active_thing_member(p_thing_id) then raise exception 'thing_unavailable'; end if;
  select * into proposal from public.current_charm_proposals where thing_id=p_thing_id;
  if not found or p_expected_version is distinct from proposal.proposal_version then raise exception 'proposal_changed'; end if;
  if proposal.proposed_by=actor then raise exception 'own_proposal'; end if;
  derived_color:=case proposal.charm_key when 'clover' then 'acid' when 'cherry' then 'cherry' when 'moon' then 'electric_blue' when 'spark' then 'butter' when 'flame' then 'tangerine' when 'heart' then 'cherry' when 'dice' then 'paper' when 'eye' then 'electric_blue' when 'mushroom' then 'purple' when 'cloud' then 'electric_blue' when 'lightning' then 'acid' when 'planet' then 'electric_blue' end;
  update public.things set charm_key=proposal.charm_key,status=case when status='pending_charm' then 'active' else status end,
    activated_at=case when status='pending_charm' then coalesce(activated_at,now()) else activated_at end,
    color_key=case when color_source='charm' then derived_color else color_key end where id=p_thing_id;
  delete from public.current_charm_proposals where thing_id=p_thing_id;
end;
$$;

create function public.decline_thing_charm(p_thing_id uuid,p_expected_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.thing_account(); proposal public.current_charm_proposals;
begin
  if not exists(select 1 from public.things where id=p_thing_id and status='active') or not public.is_active_thing_member(p_thing_id) then raise exception 'thing_unavailable'; end if;
  select * into proposal from public.current_charm_proposals where thing_id=p_thing_id for update;
  if not found or proposal.proposal_version is distinct from p_expected_version then raise exception 'proposal_changed'; end if;
  if proposal.proposed_by=actor then raise exception 'own_proposal'; end if;
  delete from public.current_charm_proposals where thing_id=p_thing_id;
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
  insert into public.thing_souvenirs(thing_id,souvenir_key,source_hangout_id,metadata_json) values(target.thing_id,'HEAT_CHECK',target.id,payload) on conflict(thing_id,souvenir_key) do nothing;
  return payload;
end;
$$;

revoke all on function public.update_thing_nickname(uuid,text),public.decline_thing_charm(uuid,integer) from public,anon,authenticated;
grant execute on function public.update_thing_nickname(uuid,text),public.decline_thing_charm(uuid,integer) to authenticated;

commit;
