import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { Milestones, SpaceCollage }=await import('../src/features/space/screen.tsx');

const thing={id:'thing-1',nickname:null,status:'active',charm_key:'moon',color_key:'purple',color_source:'manual',created_by:'a',viewer_id:'a',members:[{user_id:'a',display_name:'Alex'},{user_id:'b',display_name:'Sam'}],proposal:null,invite:null,active_hangout:null,recent_hangouts:[]};
const sameBrain={hangouts:1,rounds:8,matches:5,lifetime_match_rate:.625,best_session_match_rate:.625,best_match_streak:2};

function snapshot(progress,{discovered=false,unlocked=progress===3,highest='spicy'}={}) {
  return {thing_id:thing.id,status:'active',charm_key:'moon',color_key:'purple',members:thing.members,total_completed_hangouts:4,current_streak:1,best_streak:2,same_brain:sameBrain,know_me:{predictions:4,correct:2,accuracy:.5,best_session_rate:.5},this_or_that:{rounds:4,agreements:2,agreement_rate:.5},hot:{hangouts:3,spicy_hangouts:3,highest_level:highest,kitkat_progress:progress,kitkat_unlocked:unlocked},souvenirs:discovered?[{key:'KITKAT',unlocked_at:'2026-10-05T00:00:00Z',source_hangout_id:'hot-4'}]:[]};
}

function renderSpace(space) {
  return renderToStaticMarkup(h('div',null,h(Milestones,{space}),h(SpaceCollage,{thing,space,messages:[],moments:[],activity:h('div',null,'activity')})));
}

function assertSecret(html) {
  assert.doesNotMatch(html,/kitkat/i);
  assert.doesNotMatch(html,/toward|secret level|hidden level/i);
  assert.doesNotMatch(html,/\b\d+\s*\/\s*3\b/);
}

test('zero internal progress reveals nothing in Space',()=>assertSecret(renderSpace(snapshot(0,{unlocked:false,highest:null}))));

test('two internal steps reveal neither a name nor a counter',()=>{
  const html=renderSpace(snapshot(2)); assertSecret(html); assert.match(html,/Hot reached Spicy/);
});

test('eligibility at three is not discovery',()=>assertSecret(renderSpace(snapshot(3,{highest:'kitkat'}))));

test('a pending hidden offer remains secret in Space',()=>assertSecret(renderSpace(snapshot(3,{unlocked:true,highest:'spicy'}))));

test('first true mutual entry permits historical Space and souvenir copy',()=>{
  const html=renderSpace(snapshot(0,{discovered:true,unlocked:false,highest:'kitkat'}));
  assert.match(html,/KitKat found/); assert.match(html,/KITKAT/);
});

test('future cycle progress stays hidden after discovery',()=>{
  const html=renderSpace(snapshot(2,{discovered:true,unlocked:false,highest:'kitkat'}));
  assert.match(html,/KitKat found/); assert.doesNotMatch(html,/2\s*\/\s*3|toward/i);
});
