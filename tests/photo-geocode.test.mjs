import test from 'node:test';
import assert from 'node:assert/strict';

const { reverseGeocodePhotoCity } = await import('../src/features/photos/geocode.ts');

test('reverse geocoding sends coarse coordinates and normalizes Mexico City',async()=>{
  let requestUrl, requestOptions;
  const fakeFetch=async(url,options)=>{
    requestUrl=new URL(url); requestOptions=options;
    return new Response(JSON.stringify({address:{city:'Ciudad de México'}}),{status:200,headers:{'content-type':'application/json'}});
  };
  assert.equal(await reverseGeocodePhotoCity(19.425123,-99.133456,fakeFetch),'CDMX');
  assert.equal(requestUrl.searchParams.get('lat'),'19.43');
  assert.equal(requestUrl.searchParams.get('lon'),'-99.13');
  assert.equal(requestUrl.searchParams.get('zoom'),'10');
  assert.match(requestOptions.headers['User-Agent'],/^THING\//);
});

test('reverse geocoding falls back to town and never blocks on provider failure',async()=>{
  const townFetch=async()=>new Response(JSON.stringify({address:{town:'Tepoztlán'}}),{status:200});
  assert.equal(await reverseGeocodePhotoCity(18.98,-99.10,townFetch),'Tepoztlán');
  assert.equal(await reverseGeocodePhotoCity(18.98,-99.10,async()=>{throw new Error('offline')}),null);
  assert.equal(await reverseGeocodePhotoCity(200,-99.10,townFetch),null);
});
