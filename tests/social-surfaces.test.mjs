import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime.js';

registerHooks({ resolve(specifier, context, next) {
  if (specifier === './actions' && context.parentURL?.includes('/features/chat/')) return { url: 'data:text/javascript,export async function sendMessage(){}', shortCircuit: true };
  if (specifier === './actions' && context.parentURL?.includes('/features/moments/')) return { url: 'data:text/javascript,export async function addMoment(){}', shortCircuit: true };
  if (specifier === './actions' && context.parentURL?.includes('/features/photos/')) return { url: 'data:text/javascript,export async function uploadThingPhoto(){}', shortCircuit: true };
  if (specifier === './download-actions' && context.parentURL?.includes('/features/photos/')) return { url: 'data:text/javascript,export async function createThingPhotoDownload(){return {ok:false,error:"download_unavailable"}}', shortCircuit: true };
  return next(specifier, context);
} });

const { normalizeMessage } = await import('../src/features/chat/model.ts');
const { validateMomentFile } = await import('../src/features/moments/model.ts');
const { ChatScreen } = await import('../src/features/chat/screen.tsx');
const { MomentsScreen } = await import('../src/features/moments/screen.tsx');
const { MomentViewer } = await import('../src/features/moments/viewer.tsx');
const { PhotoViewer } = await import('../src/features/photos/viewer.tsx');
const { SouvenirShelf, StatStrip } = await import('../src/features/space/screen.tsx');
const { getSouvenir, souvenirRegistry } = await import('../src/lib/souvenirs.ts');
const { recentThingItems } = await import('../src/features/space/preview.ts');
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
  const html=render(MomentsScreen,{thing,moments:{ok:true,data:[{id:'one',thing_id:thing.id,author_id:'a',storage_path:'p',caption:'that afternoon',created_at:'2030-01-01T00:00:00Z',image_url:'https://example.test/signed'}]},gallery:{ok:true,data:[]}});
  assert.match(html,/shared photos/); assert.match(html,/that afternoon/); assert.match(html,/type="file"/);
  assert.match(html,/add a photo/); assert.match(html,/Open moment: that afternoon/);
  const galleryHtml=render(MomentsScreen,{thing,moments:{ok:true,data:[]},gallery:{ok:true,data:[]},initialView:'gallery'});
  assert.match(galleryHtml,/nothing here yet/);
  assert.match(galleryHtml,/<input[^>]*accept="image\/jpeg,image\/png,image\/webp"[^>]*multiple=""/);
  assert.match(galleryHtml,/select photos/);
  assert.match(galleryHtml,/up to 50 photos.*20 MB each/);
  assert.match(galleryHtml,/thing-primary-button/);
});

test('Moment viewer keeps the instant-photo crop, tag, caption and date',()=>{
  const moment={id:'one',thing_id:thing.id,author_id:'a',storage_path:'p',caption:'that afternoon',created_at:'2030-01-01T00:00:00Z',image_url:'https://example.test/signed'};
  const html=render(MomentViewer,{moment,onClose(){}});
  assert.match(html,/role="dialog"/); assert.match(html,/Moment photo/); assert.match(html,/aspect-square/); assert.match(html,/object-cover/);
  assert.match(html,/>moment</); assert.match(html,/that afternoon/); assert.match(html,/Jan 1, 2030/); assert.match(html,/Close moment/);
});

test('Gallery opens a private original viewer with metadata, navigation and actions',()=>{
  const galleryPhoto={id:'photo-1',thing_id:thing.id,uploaded_by:'a',storage_path:'thing-1/photo-1/original.jpg',original_filename:'night.jpg',mime_type:'image/jpeg',width:1600,height:1200,file_size_bytes:5000,content_hash:'hash',uploaded_at:'2026-10-05T10:00:00Z',taken_at:'2026-09-14T20:42:00Z',orientation:1,exif_available:true,created_at:'2026-10-05T10:00:00Z',image_url:'https://private.test/signed?token=one',location_saved:true};
  const html=render(PhotoViewer,{photos:[galleryPhoto],photoId:galleryPhoto.id,uploaderNames:{a:'Mariana'},onClose(){}});
  assert.match(html,/Photo viewer/); assert.match(html,/Mariana/); assert.match(html,/Sep 14, 2026 · 8:42 PM/); assert.match(html,/location saved/);
  assert.match(html,/Previous photo/); assert.match(html,/Next photo/); assert.match(html,/download original/); assert.match(html,/make a moment/);
  assert.match(html,/https:\/\/private\.test\/signed\?token=one/); assert.match(html,/object-contain/);
});

test('Space renders shared stats, Same Brain and Hot souvenirs as keepsakes', () => {
  const base={hangouts:1,rounds:8,matches:6,lifetime_match_rate:.75,best_session_match_rate:.75,best_match_streak:3};
  const space={thing_id:thing.id,status:'active',charm_key:'moon',color_key:'electric_blue',members:thing.members,total_completed_hangouts:4,current_streak:2,best_streak:3,same_brain:base,know_me:{predictions:8,correct:5,accuracy:.625,best_session_rate:.625},this_or_that:{rounds:8,agreements:6,agreement_rate:.75},hot:{hangouts:1,spicy_hangouts:1,highest_level:'kitkat',kitkat_progress:0,kitkat_unlocked:false},souvenirs:[{key:'FIRST_THOUGHT',unlocked_at:'2030-01-01T00:00:00Z',source_hangout_id:'h1'},{key:'HEAT_CHECK',unlocked_at:'2030-01-02T00:00:00Z',source_hangout_id:'h2'},{key:'KITKAT',unlocked_at:'2030-01-03T00:00:00Z',source_hangout_id:'h2'}]};
  const html=render(SouvenirShelf,{space})+render(StatStrip,{space});
  assert.match(html,/souvenir shelf/); assert.match(html,/FIRST THOUGHT/); assert.match(html,/HEAT CHECK/); assert.match(html,/Secret level found/); assert.match(html,/2.*day streak/s);
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
    const html=render(SouvenirShelf,{space});
    assert.match(html,/data="\/souvenirs\/missing-test\.svg"/);
    assert.match(html,/Registry-driven KitKat/);
    assert.match(html,/TEXT FALLBACK/);
  } finally { Object.assign(souvenirRegistry.KITKAT,original); }
});

test('Space previews keep only records that belong to the requested Thing', () => {
  const mixed=[{id:'a',thing_id:'thing-1'},{id:'leak',thing_id:'thing-2'},{id:'b',thing_id:'thing-1'},{id:'c',thing_id:'thing-1'}];
  assert.deepEqual(recentThingItems(mixed,'thing-1',2).map((item)=>item.id),['a','b']);
  assert.equal(recentThingItems(mixed,'thing-2',3)[0].id,'leak');
});
