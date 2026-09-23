begin;

alter table public.hangouts add column context text check (context is null or context in ('same_place', 'apart'));
alter table public.hangouts add column hot_gate text check (hot_gate is null or hot_gate in ('bold', 'spicy', 'kitkat'));
alter table public.hangouts add column hot_notice text check (hot_notice is null or hot_notice in ('level_up', 'staying_here'));
alter table public.hangouts drop constraint hangouts_hot_level_check;
alter table public.hangouts add constraint hangouts_hot_level_check
  check (hot_level is null or hot_level in ('flirty', 'bold', 'spicy', 'kitkat'));

alter table public.game_prompts drop constraint game_prompts_intensity_check;
alter table public.game_prompts add constraint game_prompts_intensity_check check (intensity between 1 and 4);

alter table public.hangout_rounds drop constraint hangout_rounds_round_number_check;
alter table public.hangout_rounds add constraint hangout_rounds_round_number_check check (round_number between 1 and 64);
alter table public.hangout_rounds add column subject_user_id uuid references auth.users(id) on delete restrict;
alter table public.hangout_rounds add column level text check (level is null or level in ('flirty', 'bold', 'spicy', 'kitkat'));
alter table public.hangout_rounds add column skipped boolean not null default false;

create table public.hangout_level_gates (
  hangout_id uuid not null references public.hangouts(id) on delete cascade,
  target_level text not null check (target_level in ('bold', 'spicy', 'kitkat')),
  resolved boolean not null default false,
  accepted boolean,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key (hangout_id, target_level),
  check ((not resolved and accepted is null and resolved_at is null) or (resolved and accepted is not null and resolved_at is not null))
);

create table public.hangout_level_votes (
  hangout_id uuid not null,
  target_level text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  accepted boolean not null,
  created_at timestamptz not null default now(),
  primary key (hangout_id, target_level, user_id),
  foreign key (hangout_id, target_level) references public.hangout_level_gates(hangout_id, target_level) on delete cascade
);

alter table public.hangout_level_gates enable row level security;
alter table public.hangout_level_votes enable row level security;
revoke all on public.hangout_level_gates, public.hangout_level_votes from anon, authenticated;

insert into public.game_prompts
  (game_type, round_type, prompt_en, prompt_es, option_a_en, option_a_es, option_b_en, option_b_es, context, intensity, tags)
values
  ('know_me','prediction','Your ideal free evening is…','Tu tarde libre ideal es…','out somewhere','salir a algún lugar','home and cozy','en casa y a gusto','anywhere',1,'{plans}'),
  ('know_me','prediction','Which little gift feels better?','¿Qué pequeño regalo se siente mejor?','a favorite snack','un snack favorito','a handwritten note','una nota escrita','anywhere',1,'{gifts}'),
  ('know_me','prediction','Pick the better reset.','Elige la mejor forma de reiniciar.','a long walk','una caminata larga','a long nap','una siesta larga','anywhere',1,'{wellbeing}'),
  ('know_me','prediction','For a surprise trip, choose…','Para un viaje sorpresa, elige…','the beach','la playa','a big city','una gran ciudad','anywhere',1,'{travel}'),
  ('know_me','prediction','What belongs on the perfect breakfast?','¿Qué va en el desayuno perfecto?','something sweet','algo dulce','something savory','algo salado','anywhere',1,'{food}'),
  ('know_me','prediction','A photo is better when it is…','Una foto es mejor cuando es…','carefully posed','bien posada','completely candid','totalmente espontánea','anywhere',1,'{memories}'),
  ('know_me','prediction','Choose a tiny luxury.','Elige un pequeño lujo.','fresh flowers','flores frescas','really good coffee','un café muy bueno','anywhere',1,'{favorites}'),
  ('know_me','prediction','Pick a comfort rewatch.','Elige algo reconfortante para volver a ver.','a funny series','una serie divertida','a favorite movie','una película favorita','anywhere',1,'{media}'),

  ('this_or_that','vote','Who would survive longer without their phone?','¿Quién sobreviviría más tiempo sin su teléfono?','Person A','Persona A','Person B','Persona B','anywhere',1,'{habits}'),
  ('this_or_that','vote','Who is more likely to plan a surprise?','¿Quién es más probable que planee una sorpresa?','Person A','Persona A','Person B','Persona B','anywhere',1,'{plans}'),
  ('this_or_that','vote','Who takes longer to choose what to eat?','¿Quién tarda más en elegir qué comer?','Person A','Persona A','Person B','Persona B','anywhere',1,'{food}'),
  ('this_or_that','vote','Who remembers the smallest details?','¿Quién recuerda los detalles más pequeños?','Person A','Persona A','Person B','Persona B','anywhere',1,'{memories}'),
  ('this_or_that','vote','Who would start dancing first?','¿Quién empezaría a bailar primero?','Person A','Persona A','Person B','Persona B','anywhere',1,'{playful}'),
  ('this_or_that','vote','Who is more likely to get lost?','¿Quién es más probable que se pierda?','Person A','Persona A','Person B','Persona B','anywhere',1,'{travel}'),
  ('this_or_that','vote','Who sends the better voice notes?','¿Quién manda mejores notas de voz?','Person A','Persona A','Person B','Persona B','anywhere',1,'{communication}'),
  ('this_or_that','vote','Who would adopt another plant first?','¿Quién adoptaría otra planta primero?','Person A','Persona A','Person B','Persona B','anywhere',1,'{home}'),

  ('hot','choice','Pick the sweeter invitation.','Elige la invitación más dulce.','come closer','acércate','tell me something','cuéntame algo','both',1,'{flirty}'),
  ('hot','choice','Choose the look that says more.','Elige la mirada que dice más.','a quick glance','una mirada rápida','a long look','una mirada larga','both',1,'{flirty}'),
  ('hot','choice','What sounds better right now?','¿Qué suena mejor ahora?','hold hands','tomarse de la mano','sit closer','sentarse más cerca','same_place',1,'{flirty}'),
  ('hot','choice','Send a tiny signal.','Manda una señal pequeña.','a voice note','una nota de voz','a secret emoji','un emoji secreto','apart',1,'{flirty}'),

  ('hot','choice','Pick the bolder move.','Elige el movimiento más atrevido.','make the first move','dar el primer paso','ask for one','pedir que lo dé','both',2,'{bold}'),
  ('hot','choice','Which compliment lands harder?','¿Qué cumplido pega más fuerte?','say it softly','decirlo suave','say it directly','decirlo directo','both',2,'{bold}'),
  ('hot','choice','Choose the next dare.','Elige el siguiente reto.','a closer whisper','un susurro más cerca','a lingering touch','un toque prolongado','same_place',2,'{bold}'),
  ('hot','choice','Choose what to send.','Elige qué mandar.','a bold text','un mensaje atrevido','a private voice note','una nota de voz privada','apart',2,'{bold}'),

  ('hot','choice','Choose the slower tease.','Elige la provocación más lenta.','build suspense','crear suspenso','say exactly what you want','decir exactamente qué quieres','both',3,'{spicy}'),
  ('hot','choice','Pick tonight’s energy.','Elige la energía de esta noche.','take the lead','tomar la iniciativa','give up control','ceder el control','both',3,'{spicy}'),
  ('hot','choice','What raises the temperature?','¿Qué sube la temperatura?','closer and slower','más cerca y lento','bolder and faster','más atrevido y rápido','same_place',3,'{spicy}'),
  ('hot','choice','Choose the anticipation.','Elige la anticipación.','describe it','describirlo','save it for later','guardarlo para después','apart',3,'{spicy}'),

  ('hot','choice','KitKat: choose the secret door.','KitKat: elige la puerta secreta.','open it slowly','abrirla despacio','step through together','cruzarla juntos','both',4,'{kitkat}'),
  ('hot','choice','KitKat: one more choice.','KitKat: una elección más.','keep the mystery','mantener el misterio','say the quiet part','decir lo que callaban','both',4,'{kitkat}'),
  ('hot','choice','KitKat: pick the hidden signal.','KitKat: elige la señal escondida.','a word','una palabra','a touch','un toque','same_place',4,'{kitkat}'),
  ('hot','choice','KitKat: send the hidden signal.','KitKat: manda la señal escondida.','a word','una palabra','a photo clue','una pista en foto','apart',4,'{kitkat}')
on conflict (game_type, prompt_en) do nothing;

insert into public.game_prompts
  (game_type, round_type, prompt_en, prompt_es, option_a_en, option_a_es, option_b_en, option_b_es, context, intensity, tags)
values
  ('hot','choice','Choose the first spark.','Elige la primera chispa.','a playful smile','una sonrisa juguetona','a quiet compliment','un cumplido suave','both',1,'{flirty}'),
  ('hot','choice','Pick a little closer.','Elige un poco más cerca.','share a secret','compartir un secreto','ask a sweet question','hacer una pregunta linda','both',1,'{flirty}'),
  ('hot','choice','What starts the butterflies?','¿Qué despierta las mariposas?','a knowing look','una mirada cómplice','an unexpected message','un mensaje inesperado','both',1,'{flirty}'),
  ('hot','choice','Choose your soft signal.','Elige tu señal suave.','a favorite nickname','un apodo favorito','a private joke','un chiste privado','both',1,'{flirty}'),
  ('hot','choice','Pick the next sweet move.','Elige el siguiente gesto dulce.','say what you noticed','decir lo que notaste','ask what they noticed','preguntar qué notó','both',1,'{flirty}'),
  ('hot','choice','Choose the braver invitation.','Elige la invitación más valiente.','be direct','ser directo','make them guess','hacer que adivine','both',2,'{bold}'),
  ('hot','choice','Pick the stronger signal.','Elige la señal más fuerte.','hold the look','sostener la mirada','say the thought','decir lo pensado','both',2,'{bold}'),
  ('hot','choice','What should happen next?','¿Qué debería pasar después?','raise the tension','subir la tensión','break the tension','romper la tensión','both',2,'{bold}'),
  ('hot','choice','Choose a bold promise.','Elige una promesa atrevida.','right now','ahora mismo','later tonight','más tarde','both',2,'{bold}'),
  ('hot','choice','Pick who leads the moment.','Elige quién guía el momento.','you lead','tú guías','they lead','la otra persona guía','both',2,'{bold}'),
  ('hot','choice','Choose the hotter possibility.','Elige la posibilidad más intensa.','slow anticipation','anticipación lenta','sudden intensity','intensidad repentina','both',3,'{spicy}'),
  ('hot','choice','Pick the private mood.','Elige el mood privado.','playful','juguetón','intense','intenso','both',3,'{spicy}'),
  ('hot','choice','What makes the moment linger?','¿Qué hace durar el momento?','taking your time','tomarse su tiempo','asking for more','pedir más','both',3,'{spicy}'),
  ('hot','choice','Choose the tempting answer.','Elige la respuesta tentadora.','yes, slowly','sí, despacio','yes, boldly','sí, sin dudar','both',3,'{spicy}'),
  ('hot','choice','Pick the next private dare.','Elige el siguiente reto privado.','show the intention','mostrar la intención','say the intention','decir la intención','both',3,'{spicy}'),
  ('hot','choice','KitKat: choose what stays secret.','KitKat: elige lo que queda en secreto.','the plan','el plan','the signal','la señal','both',4,'{kitkat}'),
  ('hot','choice','KitKat: pick the deeper door.','KitKat: elige la puerta más profunda.','curiosity','curiosidad','certainty','certeza','both',4,'{kitkat}'),
  ('hot','choice','KitKat: choose the hidden pace.','KitKat: elige el ritmo escondido.','slow','lento','unpredictable','impredecible','both',4,'{kitkat}'),
  ('hot','choice','KitKat: one private promise.','KitKat: una promesa privada.','keep it subtle','mantenerlo sutil','make it clear','dejarlo claro','both',4,'{kitkat}'),
  ('hot','choice','KitKat: pick the final key.','KitKat: elige la llave final.','trust','confianza','surprise','sorpresa','both',4,'{kitkat}')
on conflict (game_type, prompt_en) do nothing;

create or replace function public.abandon_hangout(p_hangout_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.hangouts;
begin
  select * into target from public.hangouts where id = p_hangout_id for update;
  if not found or not public.is_active_thing_member(target.thing_id) then raise exception 'hangout_unavailable'; end if;
  if target.state = 'abandoned' then return; end if;
  if target.state = 'complete' then raise exception 'hangout_complete'; end if;
  if target.state not in ('setup','waiting','ready','active') then raise exception 'hangout_unavailable'; end if;
  update public.hangouts set state = 'abandoned', completed_at = coalesce(completed_at, now()), hot_gate = null where id = target.id;
end;
$$;

drop function public.create_hangout(uuid, text, text);
create function public.create_hangout(p_thing_id uuid, p_game_type text, p_hot_mode text default null, p_context text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.things; existing public.hangouts; target_id uuid; setup jsonb; chosen_mode text;
begin
  if p_game_type is null or p_game_type not in ('same_brain','know_me','this_or_that','hot') then raise exception 'invalid_game_type'; end if;
  select * into target from public.things where id = p_thing_id for update;
  if not found or target.status <> 'active' or not public.is_active_thing_member(p_thing_id) then raise exception 'thing_unavailable'; end if;
  if (select count(*) from public.thing_members where thing_id = p_thing_id and status = 'active') <> 2 then raise exception 'thing_unavailable'; end if;
  select * into existing from public.hangouts where thing_id = p_thing_id and state in ('setup','waiting','ready','active') order by created_at,id limit 1 for update;
  if found then
    if existing.game_type = p_game_type then
      insert into public.hangout_members(hangout_id,user_id) values(existing.id,actor) on conflict do nothing;
      if existing.state = 'waiting' and (select count(*) from public.hangout_members where hangout_id=existing.id)=2 then
        update public.hangouts set state='active' where id=existing.id;
      end if;
      return jsonb_build_object('id',existing.id,'game_type',existing.game_type,'created',false,'joined',true,'conflict',false);
    end if;
    return jsonb_build_object('id',existing.id,'game_type',existing.game_type,'created',false,
      'joined',exists(select 1 from public.hangout_members where hangout_id=existing.id and user_id=actor),'conflict',true);
  end if;
  if p_game_type = 'hot' then
    chosen_mode := coalesce(p_hot_mode,'standard');
    if chosen_mode not in ('standard','our_deck') then raise exception 'invalid_hot_mode'; end if;
    if p_context not in ('same_place','apart') then raise exception 'invalid_hot_context'; end if;
    if chosen_mode = 'our_deck' then
      setup := public.hot_setup_snapshot(p_thing_id);
      if coalesce((setup->>'our_deck_available')::boolean,false)=false then raise exception 'our_deck_unavailable'; end if;
    end if;
    insert into public.hangouts(thing_id,game_type,hot_level,hot_mode,context)
      values(p_thing_id,'hot',case when chosen_mode='our_deck' then setup->>'shared_level' else 'flirty' end,chosen_mode,p_context) returning id into target_id;
  else
    if p_hot_mode is not null or p_context is not null then raise exception 'invalid_game_type'; end if;
    insert into public.hangouts(thing_id,game_type) values(p_thing_id,p_game_type) returning id into target_id;
  end if;
  insert into public.hangout_members(hangout_id,user_id) values(target_id,actor);
  return jsonb_build_object('id',target_id,'game_type',p_game_type,'created',true,'joined',true,'conflict',false);
end;
$$;

create or replace function public.join_hangout(p_hangout_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.hangouts; parent public.things;
begin
  select * into target from public.hangouts where id=p_hangout_id;
  if not found then raise exception 'hangout_unavailable'; end if;
  select * into parent from public.things where id=target.thing_id for update;
  select * into target from public.hangouts where id=p_hangout_id for update;
  if parent.status <> 'active' or target.state not in ('setup','waiting','ready','active') or not public.is_active_thing_member(parent.id) then raise exception 'hangout_unavailable'; end if;
  insert into public.hangout_members(hangout_id,user_id) values(target.id,actor) on conflict do nothing;
  if (select count(*) from public.hangout_members where hangout_id=target.id)>2 then raise exception 'hangout_unavailable'; end if;
  if target.state='waiting' and (select count(*) from public.hangout_members where hangout_id=target.id)=2 then update public.hangouts set state='active' where id=target.id; end if;
end;
$$;

create function public.start_choice_engine(p_hangout_id uuid, p_game_type text) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.hangouts; available integer; member_count integer;
begin
  select * into target from public.hangouts where id=p_hangout_id for update;
  if not found or target.game_type<>p_game_type or p_game_type not in ('know_me','this_or_that') or target.state not in ('setup','waiting','active')
    or not exists(select 1 from public.hangout_members where hangout_id=target.id and user_id=actor)
    or not exists(select 1 from public.things where id=target.thing_id and status='active') then raise exception 'hangout_unavailable'; end if;
  if target.state in ('waiting','active') then return; end if;
  select count(*) into available from public.game_prompts where game_type=p_game_type and active;
  if available<8 then raise exception 'prompt_pack_unavailable'; end if;
  insert into public.hangout_rounds(hangout_id,round_number,prompt_id,state,subject_user_id)
    select target.id,chosen.n,chosen.id,case when chosen.n=1 then 'answering' else 'pending' end,
      case when p_game_type='know_me' then (select user_id from public.thing_members where thing_id=target.thing_id and status='active' and seat=case when chosen.n%2=1 then 1 else 2 end) end
    from (select id,row_number() over()::integer n from (select id from public.game_prompts where game_type=p_game_type and active order by random() limit 8) picked) chosen
    on conflict(hangout_id,round_number) do nothing;
  if (select count(*) from public.hangout_rounds where hangout_id=target.id)<>8 then raise exception 'hangout_unavailable'; end if;
  select count(*) into member_count from public.hangout_members where hangout_id=target.id;
  update public.hangouts set state=case when member_count=2 then 'active' else 'waiting' end,started_at=coalesce(started_at,now()) where id=target.id;
end;
$$;

create function public.start_know_me(p_hangout_id uuid) returns void language sql security definer set search_path='' as $$ select public.start_choice_engine(p_hangout_id,'know_me') $$;
create function public.start_this_or_that(p_hangout_id uuid) returns void language sql security definer set search_path='' as $$ select public.start_choice_engine(p_hangout_id,'this_or_that') $$;

create function public.choice_engine_snapshot(p_hangout_id uuid, p_game_type text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.thing_account(); target public.hangouts; current_round public.hangout_rounds; prompt public.game_prompts; payload jsonb; color text; subject_name text; predictor_name text;
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
      'answers',case when current_round.state='revealed' then (select coalesce(jsonb_agg(jsonb_build_object('answer_key',a.answer_key,'is_self',a.user_id=actor,'is_subject',a.user_id=current_round.subject_user_id,'display_name',p.display_name) order by (a.user_id=actor) desc),'[]'::jsonb) from public.hangout_answers a join public.profiles p on p.id=a.user_id where a.round_id=current_round.id) else '[]'::jsonb end) end,
    'result',(select result_json from public.hangout_results where hangout_id=target.id)) into payload;
  return payload;
end;
$$;

create function public.know_me_snapshot(p_hangout_id uuid) returns jsonb language sql stable security definer set search_path='' as $$ select public.choice_engine_snapshot(p_hangout_id,'know_me') $$;
create function public.this_or_that_snapshot(p_hangout_id uuid) returns jsonb language sql stable security definer set search_path='' as $$ select public.choice_engine_snapshot(p_hangout_id,'this_or_that') $$;

create function public.submit_choice_engine_answer(p_hangout_id uuid,p_round_id uuid,p_answer_key text,p_game_type text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid := public.thing_account(); target public.hangouts; target_round public.hangout_rounds;
begin
  if p_answer_key not in ('a','b') then raise exception 'invalid_answer'; end if;
  select * into target from public.hangouts where id=p_hangout_id for update;
  select * into target_round from public.hangout_rounds where id=p_round_id and hangout_id=p_hangout_id for update;
  if target.id is null or target.game_type<>p_game_type or target.state<>'active' or target_round.id is null or target_round.state<>'answering'
    or not exists(select 1 from public.hangout_members where hangout_id=target.id and user_id=actor) then raise exception 'round_unavailable'; end if;
  insert into public.hangout_answers(round_id,user_id,answer_key) values(target_round.id,actor,p_answer_key) on conflict(round_id,user_id) do nothing;
  if (select answer_key from public.hangout_answers where round_id=target_round.id and user_id=actor)<>p_answer_key then raise exception 'answer_locked'; end if;
  if (select count(*) from public.hangout_answers where round_id=target_round.id)=2 then update public.hangout_rounds set state='revealed',revealed_at=now() where id=target_round.id; end if;
end;
$$;

create function public.submit_know_me_answer(p_hangout_id uuid,p_round_id uuid,p_answer_key text) returns void language sql security definer set search_path='' as $$ select public.submit_choice_engine_answer(p_hangout_id,p_round_id,p_answer_key,'know_me') $$;
create function public.submit_this_or_that_vote(p_hangout_id uuid,p_round_id uuid,p_answer_key text) returns void language sql security definer set search_path='' as $$ select public.submit_choice_engine_answer(p_hangout_id,p_round_id,p_answer_key,'this_or_that') $$;

create function public.finish_choice_engine_locked(p_hangout_id uuid,p_game_type text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.thing_account(); target public.hangouts; payload jsonb; rounds_count integer; correct_count integer; agreements integer; votes_a integer; votes_b integer;
begin
  select * into target from public.hangouts where id=p_hangout_id for update;
  if not found or target.game_type<>p_game_type or not exists(select 1 from public.hangout_members where hangout_id=target.id and user_id=actor) then raise exception 'hangout_unavailable'; end if;
  select count(*) into rounds_count from public.hangout_rounds where hangout_id=target.id and state='revealed';
  if rounds_count<>8 then raise exception 'round_unavailable'; end if;
  if p_game_type='know_me' then
    select count(*) filter(where subject_answer=prediction)::integer into correct_count from (
      select r.id,max(a.answer_key) filter(where a.user_id=r.subject_user_id) subject_answer,max(a.answer_key) filter(where a.user_id<>r.subject_user_id) prediction
      from public.hangout_rounds r join public.hangout_answers a on a.round_id=r.id where r.hangout_id=target.id group by r.id
    ) answers;
    select jsonb_build_object('rounds',8,'correct_predictions',correct_count,'predictions_by_user',coalesce(jsonb_object_agg(user_id::text,correct),'{}'::jsonb)) into payload from (
      select predictor.user_id,count(*) filter(where predictor.answer_key=subject.answer_key)::integer correct
      from public.hangout_rounds r join public.hangout_answers predictor on predictor.round_id=r.id and predictor.user_id<>r.subject_user_id
      join public.hangout_answers subject on subject.round_id=r.id and subject.user_id=r.subject_user_id where r.hangout_id=target.id group by predictor.user_id
    ) per_user;
  else
    select count(*) filter(where low_answer=high_answer)::integer,sum(a_votes)::integer,sum(b_votes)::integer into agreements,votes_a,votes_b from (
      select r.id,min(a.answer_key) low_answer,max(a.answer_key) high_answer,count(*) filter(where a.answer_key='a') a_votes,count(*) filter(where a.answer_key='b') b_votes
      from public.hangout_rounds r join public.hangout_answers a on a.round_id=r.id where r.hangout_id=target.id group by r.id
    ) votes;
    payload:=jsonb_build_object('rounds',8,'agreements',agreements,'agreement_rate',agreements::numeric/8,'votes_for_a',votes_a,'votes_for_b',votes_b);
  end if;
  insert into public.hangout_results(hangout_id,game_type,rounds_played,result_json) values(target.id,p_game_type,8,payload) on conflict(hangout_id) do nothing;
  update public.hangouts set state='complete',completed_at=coalesce(completed_at,now()),result=payload where id=target.id and state<>'complete';
  return (select result_json from public.hangout_results where hangout_id=target.id);
end;
$$;

create function public.advance_choice_engine_round(p_hangout_id uuid,p_game_type text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.thing_account(); target public.hangouts; current_round public.hangout_rounds; next_id uuid;
begin
  select * into target from public.hangouts where id=p_hangout_id for update;
  if not found or target.game_type<>p_game_type or target.state not in ('active','complete') or not exists(select 1 from public.hangout_members where hangout_id=target.id and user_id=actor) then raise exception 'hangout_unavailable'; end if;
  if target.state='complete' then return; end if;
  select * into current_round from public.hangout_rounds where hangout_id=target.id and state='revealed' order by round_number desc limit 1;
  if not found or exists(select 1 from public.hangout_rounds where hangout_id=target.id and state='answering') then raise exception 'round_unavailable'; end if;
  select id into next_id from public.hangout_rounds where hangout_id=target.id and round_number=current_round.round_number+1 and state='pending';
  if next_id is not null then update public.hangout_rounds set state='answering' where id=next_id; else perform public.finish_choice_engine_locked(target.id,p_game_type); end if;
end;
$$;

create function public.advance_know_me_round(p_hangout_id uuid) returns void language sql security definer set search_path='' as $$ select public.advance_choice_engine_round(p_hangout_id,'know_me') $$;
create function public.advance_this_or_that_round(p_hangout_id uuid) returns void language sql security definer set search_path='' as $$ select public.advance_choice_engine_round(p_hangout_id,'this_or_that') $$;
create function public.complete_know_me(p_hangout_id uuid) returns jsonb language sql security definer set search_path='' as $$ select public.finish_choice_engine_locked(p_hangout_id,'know_me') $$;
create function public.complete_this_or_that(p_hangout_id uuid) returns jsonb language sql security definer set search_path='' as $$ select public.finish_choice_engine_locked(p_hangout_id,'this_or_that') $$;

create function public.hot_add_prompt_locked(p_hangout_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare target public.hangouts; prompt_id uuid; next_number integer; level_intensity integer;
begin
  select * into target from public.hangouts where id=p_hangout_id for update;
  level_intensity:=case target.hot_level when 'flirty' then 1 when 'bold' then 2 when 'spicy' then 3 when 'kitkat' then 4 end;
  select p.id into prompt_id from public.game_prompts p where p.game_type='hot' and p.active and p.intensity=level_intensity
    and p.context in ('both',target.context) and not exists(select 1 from public.hangout_rounds r where r.hangout_id=target.id and r.prompt_id=p.id)
    order by random() limit 1;
  if prompt_id is null then raise exception 'prompt_pack_unavailable'; end if;
  select coalesce(max(round_number),0)+1 into next_number from public.hangout_rounds where hangout_id=target.id;
  insert into public.hangout_rounds(hangout_id,round_number,prompt_id,state,level) values(target.id,next_number,prompt_id,'answering',target.hot_level);
  update public.hangouts set hot_notice=null where id=target.id;
  return prompt_id;
end;
$$;

create function public.start_hot(p_hangout_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.thing_account(); target public.hangouts; member_count integer;
begin
  select * into target from public.hangouts where id=p_hangout_id for update;
  if not found or target.game_type<>'hot' or target.context not in ('same_place','apart') or target.state not in ('setup','waiting','active')
    or not exists(select 1 from public.hangout_members where hangout_id=target.id and user_id=actor)
    or not exists(select 1 from public.things where id=target.thing_id and status='active') then raise exception 'hangout_unavailable'; end if;
  if target.state in ('waiting','active') then return; end if;
  if not exists(select 1 from public.hangout_rounds where hangout_id=target.id) then perform public.hot_add_prompt_locked(target.id); end if;
  select count(*) into member_count from public.hangout_members where hangout_id=target.id;
  update public.hangouts set state=case when member_count=2 then 'active' else 'waiting' end,started_at=coalesce(started_at,now()),hot_level='flirty' where id=target.id;
end;
$$;

create function public.hot_snapshot(p_hangout_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.thing_account(); target public.hangouts; current_round public.hangout_rounds; prompt public.game_prompts; color text; payload jsonb; unlocked boolean;
begin
  select * into target from public.hangouts where id=p_hangout_id;
  if not found or target.game_type<>'hot' or not exists(select 1 from public.hangout_members where hangout_id=target.id and user_id=actor) then raise exception 'hangout_unavailable'; end if;
  select color_key into color from public.things where id=target.thing_id;
  select count(*)>=3 into unlocked from public.hangout_results r join public.hangouts h on h.id=r.hangout_id where h.thing_id=target.thing_id and r.game_type='hot' and h.state='complete' and coalesce((r.result_json->>'reached_spicy')::boolean,false);
  select * into current_round from public.hangout_rounds where hangout_id=target.id and state='answering' order by round_number desc limit 1;
  if not found then select * into current_round from public.hangout_rounds where hangout_id=target.id and state='revealed' order by round_number desc limit 1; end if;
  if current_round.id is not null then select * into prompt from public.game_prompts where id=current_round.prompt_id; end if;
  select jsonb_build_object('id',target.id,'thing_id',target.thing_id,'state',target.state,'color_key',color,'context',target.context,'current_level',target.hot_level,'notice',target.hot_notice,
    'kitkat_unlocked',unlocked,'completed_prompts',(select count(*) from public.hangout_rounds where hangout_id=target.id and state='revealed' and not skipped),
    'members',(select coalesce(jsonb_agg(jsonb_build_object('display_name',p.display_name) order by m.seat),'[]'::jsonb) from public.thing_members m join public.profiles p on p.id=m.user_id where m.thing_id=target.thing_id and m.status='active'),
    'gate',case when target.hot_gate is null then null else jsonb_build_object('target_level',target.hot_gate,'own_vote',(select accepted from public.hangout_level_votes where hangout_id=target.id and target_level=target.hot_gate and user_id=actor),'votes_cast',(select count(*) from public.hangout_level_votes where hangout_id=target.id and target_level=target.hot_gate)) end,
    'round',case when current_round.id is null then null else jsonb_build_object('id',current_round.id,'number',current_round.round_number,'state',current_round.state,'level',current_round.level,'skipped',current_round.skipped,'round_type',prompt.round_type,
      'prompt_en',prompt.prompt_en,'prompt_es',prompt.prompt_es,'option_a_en',prompt.option_a_en,'option_a_es',prompt.option_a_es,'option_b_en',prompt.option_b_en,'option_b_es',prompt.option_b_es,
      'own_answer',(select answer_key from public.hangout_answers where round_id=current_round.id and user_id=actor),'answer_count',(select count(*) from public.hangout_answers where round_id=current_round.id),
      'answers',case when current_round.state='revealed' and not current_round.skipped then (select coalesce(jsonb_agg(jsonb_build_object('answer_key',a.answer_key,'is_self',a.user_id=actor,'display_name',p.display_name) order by (a.user_id=actor) desc),'[]'::jsonb) from public.hangout_answers a join public.profiles p on p.id=a.user_id where a.round_id=current_round.id) else '[]'::jsonb end) end,
    'result',(select result_json from public.hangout_results where hangout_id=target.id)) into payload;
  return payload;
end;
$$;

create function public.submit_hot_round(p_hangout_id uuid,p_round_id uuid,p_answer_key text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.thing_account(); target public.hangouts; target_round public.hangout_rounds;
begin
  if p_answer_key not in ('a','b') then raise exception 'invalid_answer'; end if;
  select * into target from public.hangouts where id=p_hangout_id for update;
  select * into target_round from public.hangout_rounds where id=p_round_id and hangout_id=p_hangout_id for update;
  if target.id is null or target.game_type<>'hot' or target.state<>'active' or target.hot_gate is not null or target_round.id is null or target_round.state<>'answering'
    or not exists(select 1 from public.hangout_members where hangout_id=target.id and user_id=actor) then raise exception 'round_unavailable'; end if;
  insert into public.hangout_answers(round_id,user_id,answer_key) values(target_round.id,actor,p_answer_key) on conflict(round_id,user_id) do nothing;
  if (select answer_key from public.hangout_answers where round_id=target_round.id and user_id=actor)<>p_answer_key then raise exception 'answer_locked'; end if;
  if (select count(*) from public.hangout_answers where round_id=target_round.id)=2 then update public.hangout_rounds set state='revealed',revealed_at=now() where id=target_round.id; end if;
end;
$$;

create function public.advance_hot(p_hangout_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.thing_account(); target public.hangouts; current_round public.hangout_rounds; level_count integer; gate_target text; unlocked boolean;
begin
  select * into target from public.hangouts where id=p_hangout_id for update;
  if not found or target.game_type<>'hot' or target.state not in ('active','complete') or not exists(select 1 from public.hangout_members where hangout_id=target.id and user_id=actor) then raise exception 'hangout_unavailable'; end if;
  if target.state='complete' then return; end if;
  if target.hot_gate is not null then raise exception 'round_unavailable'; end if;
  select * into current_round from public.hangout_rounds where hangout_id=target.id and state='revealed' order by round_number desc limit 1;
  if not found or exists(select 1 from public.hangout_rounds where hangout_id=target.id and state='answering') then raise exception 'round_unavailable'; end if;
  select count(*) into level_count from public.hangout_rounds where hangout_id=target.id and state='revealed' and not skipped and level=target.hot_level;
  if target.hot_level='flirty' and level_count>=2 and not exists(select 1 from public.hangout_level_gates where hangout_id=target.id and target_level='bold') then gate_target:='bold';
  elsif target.hot_level='bold' and level_count>=2 and not exists(select 1 from public.hangout_level_gates where hangout_id=target.id and target_level='spicy') then gate_target:='spicy';
  elsif target.hot_level='spicy' and level_count>=2 and not exists(select 1 from public.hangout_level_gates where hangout_id=target.id and target_level='kitkat') then
    select count(*)>=3 into unlocked from public.hangout_results r join public.hangouts h on h.id=r.hangout_id where h.thing_id=target.thing_id and r.game_type='hot' and h.state='complete' and coalesce((r.result_json->>'reached_spicy')::boolean,false);
    if unlocked then gate_target:='kitkat'; end if;
  end if;
  if gate_target is not null then
    insert into public.hangout_level_gates(hangout_id,target_level) values(target.id,gate_target);
    update public.hangouts set hot_gate=gate_target,hot_notice=null where id=target.id;
  else perform public.hot_add_prompt_locked(target.id); end if;
end;
$$;

create function public.skip_hot_prompt(p_hangout_id uuid,p_round_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.thing_account(); target public.hangouts; target_round public.hangout_rounds;
begin
  select * into target from public.hangouts where id=p_hangout_id for update;
  select * into target_round from public.hangout_rounds where id=p_round_id and hangout_id=p_hangout_id for update;
  if target.id is null or target.game_type<>'hot' or target.state<>'active' or target_round.id is null or target_round.state<>'answering'
    or not exists(select 1 from public.hangout_members where hangout_id=target.id and user_id=actor) then raise exception 'round_unavailable'; end if;
  update public.hangout_rounds set state='revealed',revealed_at=now(),skipped=true where id=target_round.id;
  perform public.advance_hot(target.id);
end;
$$;

create function public.submit_hot_escalation(p_hangout_id uuid,p_accept boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.thing_account(); target public.hangouts; vote_count integer; both_accepted boolean; gate_level text;
begin
  select * into target from public.hangouts where id=p_hangout_id for update;
  if not found or target.game_type<>'hot' or target.state<>'active' or target.hot_gate is null or not exists(select 1 from public.hangout_members where hangout_id=target.id and user_id=actor) then raise exception 'hangout_unavailable'; end if;
  gate_level:=target.hot_gate;
  insert into public.hangout_level_votes(hangout_id,target_level,user_id,accepted) values(target.id,gate_level,actor,p_accept) on conflict do nothing;
  select count(*),bool_and(v.accepted) into vote_count,both_accepted from public.hangout_level_votes v where v.hangout_id=target.id and v.target_level=gate_level;
  if vote_count=2 then
    update public.hangout_level_gates set resolved=true,accepted=both_accepted,resolved_at=now() where hangout_id=target.id and target_level=gate_level;
    update public.hangouts set hot_level=case when both_accepted then gate_level else hot_level end,hot_gate=null,hot_notice=case when both_accepted then 'level_up' else 'staying_here' end where id=target.id;
    perform public.hot_add_prompt_locked(target.id);
    update public.hangouts set hot_notice=case when both_accepted then 'level_up' else 'staying_here' end where id=target.id;
  end if;
end;
$$;

create function public.complete_hot(p_hangout_id uuid) returns jsonb
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
  return payload;
end;
$$;

create or replace function public.hangout_snapshot(p_hangout_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.thing_account(); target public.hangouts; result jsonb; color text;
begin
  select * into target from public.hangouts where id=p_hangout_id;
  if not found or not exists(select 1 from public.hangout_members where hangout_id=target.id and user_id=actor) then raise exception 'hangout_unavailable'; end if;
  select color_key into color from public.things where id=target.thing_id;
  select jsonb_build_object('id',target.id,'thing_id',target.thing_id,'game_type',target.game_type,'state',target.state,'color_key',color,'context',target.context,
    'hot_level',target.hot_level,'hot_mode',target.hot_mode,'created_at',target.created_at,'started_at',target.started_at,'completed_at',target.completed_at,
    'members',(select coalesce(jsonb_agg(jsonb_build_object('display_name',p.display_name) order by tm.seat),'[]'::jsonb) from public.hangout_members hm join public.thing_members tm on tm.thing_id=target.thing_id and tm.user_id=hm.user_id join public.profiles p on p.id=hm.user_id where hm.hangout_id=target.id),
    'own_card_count',(select count(*) from public.hot_deck_cards where hangout_id=target.id and created_by=actor),
    'partner_card_count',(select count(*) from public.hot_deck_cards where hangout_id=target.id and created_by<>actor),
    'own_batch_ready',coalesce((select batch_ready from public.hangout_members where hangout_id=target.id and user_id=actor),false),
    'both_batches_ready',(select count(*)=2 from public.hangout_members where hangout_id=target.id and batch_ready)) into result;
  return result;
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
    'hot',(select jsonb_build_object('hangouts',hangouts,'spicy_hangouts',spicy_hangouts,'highest_level',case highest_rank when 4 then 'kitkat' when 3 then 'spicy' when 2 then 'bold' when 1 then 'flirty' else null end,'kitkat_unlocked',spicy_hangouts>=3) from hot),
    'souvenirs',(select coalesce(jsonb_agg(jsonb_build_object('key',souvenir_key,'unlocked_at',unlocked_at,'source_hangout_id',source_hangout_id) order by unlocked_at),'[]'::jsonb) from public.thing_souvenirs where thing_id=target.id)) into payload;
  return payload;
end;
$$;

create or replace function public.thing_snapshot(p_thing_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.thing_account(); target public.things; result jsonb;
begin
  select * into target from public.things where id=p_thing_id;
  if not found or not public.is_active_thing_member(p_thing_id) then raise exception 'thing_unavailable'; end if;
  select jsonb_build_object('id',target.id,'status',target.status,'charm_key',target.charm_key,'color_key',target.color_key,'color_source',target.color_source,'created_by',target.created_by,'viewer_id',actor,
    'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',p.display_name) order by m.seat),'[]'::jsonb) from public.thing_members m join public.profiles p on p.id=m.user_id where m.thing_id=target.id and m.status='active'),
    'proposal',(select jsonb_build_object('charm_key',cp.charm_key,'proposed_by',cp.proposed_by,'proposer_name',p.display_name,'version',cp.proposal_version) from public.current_charm_proposals cp join public.profiles p on p.id=cp.proposed_by where cp.thing_id=target.id),
    'invite',(select jsonb_build_object('code',code,'expires_at',expires_at,'expired',expires_at<=now()) from public.thing_invites where thing_id=target.id and created_by=actor and status='active' order by created_at desc limit 1),
    'active_hangout',(select jsonb_build_object('id',h.id,'game_type',h.game_type,'state',h.state,'created_at',h.created_at,'current_user_joined',exists(select 1 from public.hangout_members hm where hm.hangout_id=h.id and hm.user_id=actor),'other_user_joined',exists(select 1 from public.hangout_members hm where hm.hangout_id=h.id and hm.user_id<>actor)) from public.hangouts h where h.thing_id=target.id and h.state in ('setup','waiting','ready','active') order by h.created_at limit 1),
    'recent_hangouts',(select coalesce(jsonb_agg(item order by item->>'completed_at' desc),'[]'::jsonb) from (select jsonb_build_object('id',h.id,'game_type',h.game_type,'state',h.state,'created_at',h.created_at,'completed_at',h.completed_at,'result',r.result_json,'souvenir_keys',coalesce((select jsonb_agg(s.souvenir_key order by s.unlocked_at) from public.thing_souvenirs s where s.source_hangout_id=h.id),'[]'::jsonb)) item from public.hangouts h join public.hangout_results r on r.hangout_id=h.id where h.thing_id=target.id and h.state='complete' order by h.completed_at desc limit 4) recent)) into result;
  return result;
end;
$$;

revoke all on function public.abandon_hangout(uuid),public.create_hangout(uuid,text,text,text),public.start_choice_engine(uuid,text),public.start_know_me(uuid),public.start_this_or_that(uuid),public.choice_engine_snapshot(uuid,text),public.know_me_snapshot(uuid),public.this_or_that_snapshot(uuid),public.submit_choice_engine_answer(uuid,uuid,text,text),public.submit_know_me_answer(uuid,uuid,text),public.submit_this_or_that_vote(uuid,uuid,text),public.finish_choice_engine_locked(uuid,text),public.advance_choice_engine_round(uuid,text),public.advance_know_me_round(uuid),public.advance_this_or_that_round(uuid),public.complete_know_me(uuid),public.complete_this_or_that(uuid),public.hot_add_prompt_locked(uuid),public.start_hot(uuid),public.hot_snapshot(uuid),public.submit_hot_round(uuid,uuid,text),public.advance_hot(uuid),public.skip_hot_prompt(uuid,uuid),public.submit_hot_escalation(uuid,boolean),public.complete_hot(uuid) from public,anon,authenticated;
grant execute on function public.abandon_hangout(uuid),public.create_hangout(uuid,text,text,text),public.start_know_me(uuid),public.start_this_or_that(uuid),public.know_me_snapshot(uuid),public.this_or_that_snapshot(uuid),public.submit_know_me_answer(uuid,uuid,text),public.submit_this_or_that_vote(uuid,uuid,text),public.advance_know_me_round(uuid),public.advance_this_or_that_round(uuid),public.complete_know_me(uuid),public.complete_this_or_that(uuid),public.start_hot(uuid),public.hot_snapshot(uuid),public.submit_hot_round(uuid,uuid,text),public.advance_hot(uuid),public.skip_hot_prompt(uuid,uuid),public.submit_hot_escalation(uuid,boolean),public.complete_hot(uuid) to authenticated;

commit;
