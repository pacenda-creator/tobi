import test from 'node:test';
import assert from 'node:assert/strict';
import { createServerClient } from '@supabase/ssr';

test('official SSR adapter writes all chunks with its second cache-header argument', async () => {
 const jar=new Map();const batches=[];
 const jwt='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:'12345678-1234-1234-1234-123456789abc',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
 const client=createServerClient('https://example.supabase.co','sb_publishable_fixture',{
  cookieOptions:{name:'tobi-auth',httpOnly:true,path:'/',sameSite:'lax'},
  global:{fetch:async()=>new Response(JSON.stringify({access_token:jwt,refresh_token:'fixture',expires_in:3600,token_type:'bearer',user:{id:'12345678-1234-1234-1234-123456789abc',user_metadata:{padding:'x'.repeat(16000)}}}),{status:200,headers:{'content-type':'application/json'}})},
  cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:(cookies,headers)=>{batches.push({cookies,headers});cookies.forEach(c=>jar.set(c.name,c.value));}},
 });
 const {error}=await client.auth.signInWithPassword({email:'fixture@example.com',password:'fixture'});
 assert.equal(error,null);assert.ok(batches.length>0);
 const cookies=batches.flatMap(b=>b.cookies);assert.ok(cookies.length>1);
 assert.ok(cookies.every(c=>c.name.startsWith('tobi-auth.')&&c.options.httpOnly&&c.options.path==='/'));
 const headers=batches[0].headers;
 assert.match(headers['Cache-Control'],/private.*no-store/);assert.equal(headers.Pragma,'no-cache');assert.equal(headers.Expires,'0');
 await client.auth.signOut({scope:'local'});
 const next=createServerClient('https://example.supabase.co','sb_publishable_fixture',{
  cookieOptions:{name:'tobi-auth'},
  global:{fetch:async()=>{throw new Error('empty local session must not need network');}},
  cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:()=>{}},
 });
 const identity=await next.auth.getUser();assert.equal(identity.data.user,null);
 await client.auth.stopAutoRefresh();await next.auth.stopAutoRefresh();
});
