import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime.js';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === './actions' && context.parentURL?.includes('/features/chat/')) return { url: 'data:text/javascript,export async function sendMessage(){}', shortCircuit: true };
  if (specifier === './actions' && context.parentURL?.includes('/features/moments/')) return { url: 'data:text/javascript,export async function addMoment(){}', shortCircuit: true };
  return next(specifier, context);
} });

const { normalizeMessage } = await import('../src/features/chat/model.ts');
const { validateMomentFile } = await import('../src/features/moments/model.ts');
const { ChatScreen } = await import('../src/features/chat/screen.tsx');
const { MomentsScreen } = await import('../src/features/moments/screen.tsx');
const { SpaceScreen } = await import('../src/features/space/screen.tsx');
const { getSouvenir, souvenirRegistry } = await import('../src/lib/souvenirs.ts');
const router = { refresh() {}, replace() {}, push() {} };
const thing = { id:'thing-1', nickname:'moon patrol', status:'active', charm_key:'moon', color_key:'electric_blue', color_source:'charm', created_by:'a', viewer_id:'a', members:[{user_id:'a',display_name:'Roh'},{user_id:'b',display_name:'Sam'}], proposal:null, invite:null, active_hangout:null, recent_hangouts:[] };
const render = (component, props) => renderToStaticMarkup(h(AppRouterContext.Provider,{value:router},h(component,props)));

test('Chat trims messages, renders authors and keeps a lightweight composer', () => {
  assert.equal(normalizeMessage('  hello   there  '), 'hello there');
  assert.equal(normalizeMessage('   '), null);
  const html=render(ChatScreen,{thing,messages:{ok:true,data:[{id:'m1',thing_id:thing.id,author_id:'b',body:'still here',created_at:'2030-01-01T00:00:00Z'}]}});
  assert.match(html,/moon patrol/); assert.match(html,/Sam/); assert.match(html,/still here/); assert.match(html,/write something/);
});

test('Moment validation checks MIME, size and signatures', async () => {
  assert.equal(await validateMomentFile(new File([Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0])],'x.png',{type:'image/png'})),null);
  assert.equal(await validateMomentFile(new File([Uint8Array.from([1,2,3])],'x.png',{type:'image/png'})),'invalid_data');
  assert.equal(await validateMomentFile(new File([Uint8Array.from([1])],'x.gif',{type:'image/gif'})),'invalid_type');
  const html=render(MomentsScreen,{thing,moments:{ok:true,data:[{id:'one',thing_id:thing.id,author_id:'a',storage_path:'p',caption:'that afternoon',created_at:'2030-01-01T00:00:00Z',image_url:'https://example.test/signed'}]}});
  assert.match(html,/shared camera roll/); assert.match(html,/that afternoon/); assert.match(html,/type="file"/);
});

test('Space renders shared stats, Same Brain and Hot souvenirs as keepsakes', () => {
  const base={hangouts:1,rounds:8,matches:6,lifetime_match_rate:.75,best_session_match_rate:.75,best_match_streak:3};
  const space={thing_id:thing.id,status:'active',charm_key:'moon',color_key:'electric_blue',members:thing.members,total_completed_hangouts:4,current_streak:2,best_streak:3,same_brain:base,know_me:{predictions:8,correct:5,accuracy:.625,best_session_rate:.625},this_or_that:{rounds:8,agreements:6,agreement_rate:.75},hot:{hangouts:1,spicy_hangouts:1,highest_level:'kitkat',kitkat_progress:0,kitkat_unlocked:false},souvenirs:[{key:'FIRST_THOUGHT',unlocked_at:'2030-01-01T00:00:00Z',source_hangout_id:'h1'},{key:'HEAT_CHECK',unlocked_at:'2030-01-02T00:00:00Z',source_hangout_id:'h2'},{key:'KITKAT',unlocked_at:'2030-01-03T00:00:00Z',source_hangout_id:'h2'}]};
  const html=render(SpaceScreen,{thing,space});
  assert.match(html,/the shelf/); assert.match(html,/FIRST THOUGHT/); assert.match(html,/HEAT CHECK/); assert.match(html,/Secret level found/); assert.match(html,/2.*day streak/s);
});

test('Every souvenir key resolves through the registry and missing artwork keeps a text sticker fallback', () => {
  const keys=['FIRST_THOUGHT','SAME_BRAIN','LOCKED_IN','PERFECT_SYNC','HEAT_CHECK','TURNED_UP','AFTER_HOURS','KITKAT'];
  assert.deepEqual(keys.map((key)=>getSouvenir(key).key),keys);
  assert.equal(getSouvenir('KITKAT').assetPath,'/souvenirs/kitkat.svg');
  const original={...souvenirRegistry.KITKAT};
  Object.assign(souvenirRegistry.KITKAT,{title:'Registry-driven KitKat',assetPath:'/souvenirs/missing-test.svg',fallbackLabel:'TEXT FALLBACK'});
  try {
    const base={hangouts:0,rounds:0,matches:0,lifetime_match_rate:0,best_session_match_rate:0,best_match_streak:0};
    const space={thing_id:thing.id,status:'active',charm_key:'moon',color_key:'electric_blue',members:thing.members,total_completed_hangouts:0,current_streak:0,best_streak:0,same_brain:base,know_me:{predictions:0,correct:0,accuracy:0,best_session_rate:0},this_or_that:{rounds:0,agreements:0,agreement_rate:0},hot:{hangouts:0,spicy_hangouts:0,highest_level:null,kitkat_progress:0,kitkat_unlocked:false},souvenirs:[{key:'KITKAT',unlocked_at:'2030-01-03T00:00:00Z',source_hangout_id:'h2'}]};
    const html=render(SpaceScreen,{thing,space});
    assert.match(html,/data="\/souvenirs\/missing-test\.svg"/);
    assert.match(html,/Registry-driven KitKat/);
    assert.match(html,/TEXT FALLBACK/);
  } finally { Object.assign(souvenirRegistry.KITKAT,original); }
});
