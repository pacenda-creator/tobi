import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
test('every private entry awaits verified authorization before content', async () => {
 for (const path of ['app/admin/page.tsx','app/doc/page.tsx','app/api/config/admin/route.ts']) {
  const source = await readFile(path,'utf8');
  assert.match(source,/await isTobiAdminAuthorized\(/);
 }
 const source = await readFile('lib/tobi-admin-auth.ts','utf8');
 assert.match(source,/async function isTobiAdminAuthorized/);
 assert.match(source,/getUser\(/);
 assert.doesNotMatch(source,/getSession\(/);
});

import { registerHooks } from 'node:module';
const state = { user: null, error: null, calls: 0, writes: null, logoutError: false };
globalThis.__tobiAuthTest = state;
registerHooks({ resolve(specifier, context, nextResolve) {
 if (specifier === 'next/server') return nextResolve('next/server.js', context);
 if (specifier === 'next/headers') return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent('export async function headers() { return new Headers(); } export async function cookies() { return { getAll() { return []; } }; }') };
 if (specifier === '@supabase/ssr') return { shortCircuit: true, url: 'data:text/javascript,' + encodeURIComponent(`export function createServerClient(url,key,options) { const s = globalThis.__tobiAuthTest; s.writes = options.cookies; s.fetch = options.global?.fetch; return { auth: { async getUser() { s.calls++; if(s.refresh) options.cookies.setAll([{name:"tobi-auth.0",value:"refreshed",options:{}}], {"Pragma":"no-cache","Expires":"0"}); return {data: {user: s.user},error:s.error}; }, async getSession() { throw Error('must not authorize'); }, async signInWithPassword() { options.cookies.setAll([{name:'tobi-auth.0',value:'fake',options:{}} ,{name:'tobi-auth.1',value:'fake',options:{}}], {'Pragma':'no-cache','Expires':'0'}); return {error:s.error}; }, async signOut() { if(s.logoutError) throw Error('offline'); return {error:null}; } } }; }`) };
 return nextResolve(specifier, context);
}});
const { authClient, authConfiguration, safeNext } = await import('../lib/tobi-supabase.ts');
const { isTobiAdminAuthorized, hasValidMutationOrigin } = await import('../lib/tobi-admin-auth.ts');
const id = '12345678-1234-1234-1234-123456789abc';
function configure() {
 process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
 process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fixture';
 process.env.TOBI_ADMIN_USER_IDS = id;
 state.user = null; state.error = null;
}
test('verified identity only; config fails closed and metadata never grants access', async () => {
 const prior = {...process.env};
 try {
 configure();
 for (const user of [null,{id:'87654321-1234-1234-1234-123456789abc',user_metadata:{role:'admin'},app_metadata:{role:'admin'}}]) {
  state.user=user; assert.equal(await isTobiAdminAuthorized(new Headers({'oai-authenticated-user-id':id, cookie:'tobi-local-admin-token=fake'})),false);
 }
 state.user={id}; assert.equal(await isTobiAdminAuthorized(),true);
 state.error={message:'expired'}; assert.equal(await isTobiAdminAuthorized(),false); state.error=null;
 for (const [key,value] of [['TOBI_ADMIN_USER_IDS',''],['TOBI_ADMIN_USER_IDS',id+',bad'],['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','sb_secret_fake'],['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','eyJlegacy'],['NEXT_PUBLIC_SUPABASE_URL','https://user@example.com'],['NEXT_PUBLIC_SUPABASE_URL','http://localhost'],['NEXT_PUBLIC_SUPABASE_URL','https://example.com/?q=1'],['NEXT_PUBLIC_SUPABASE_URL','https://example.com/#x']]) {
  configure(); process.env[key]=value; assert.equal(authConfiguration(),null); assert.equal(await isTobiAdminAuthorized(),false);
 }
 } finally {process.env=prior;}
});
test('server Auth fetch is explicitly no-store and preserves request options', async () => {
 const prior = {...process.env}; const originalFetch = globalThis.fetch; let received;
 try {
  configure();
  globalThis.fetch = async (_input, init) => { received = init; return new Response('{}'); };
  authClient(() => [], () => {});
  assert.equal(typeof state.fetch, 'function');
  await state.fetch('https://example.supabase.co/auth/v1/user', { method: 'POST', body: 'synthetic', cache: 'force-cache', headers: { 'x-fixture': 'retained' } });
  assert.equal(received.cache, 'no-store');
  assert.equal(received.method, 'POST'); assert.equal(received.body, 'synthetic');
  assert.equal(received.headers['x-fixture'], 'retained');
 } finally { globalThis.fetch = originalFetch; process.env = prior; }
});
test('redirect whitelist and strict origin', () => {
 for(const value of ['//evil','/\\evil','https://evil','/login','/auth/logout',undefined]) assert.equal(safeNext(value),'/admin');
 assert.equal(safeNext('/doc'),'/doc');
 for(const origin of [undefined,'null','https://evil','https://example.com/path']) assert.equal(hasValidMutationOrigin(new Request('https://example.com/auth/login',{headers:origin?{origin}:{}})),false);
 assert.equal(hasValidMutationOrigin(new Request('https://example.com/auth/login',{headers:{origin:'https://example.com'}})),true);
});
test('real auth handler propagates chunks and cache headers; CSRF and local logout cleanup', async () => {
 const prior = {...process.env};
 try {
 configure(); process.env.NODE_ENV='production';
 const {NextRequest} = await import('next/server');
 const {handleAuth} = await import('../lib/tobi-auth-routes.ts');
 const request=(path,origin='https://example.com',cookie='')=>new NextRequest('https://example.com'+path,{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded',cookie},body:'email=test%40example.com&password=fixture&next=%2Fdoc'});
 for(const logout of [false,true]) {const response=await handleAuth(request('/auth/login','https://evil'),logout); assert.equal(response.status,403); assert.match(response.headers.get('cache-control'),/private.*no-store/);}
 const response=await handleAuth(request('/auth/login')); assert.equal(response.status,303); assert.equal(response.headers.get('location'),'https://example.com/doc');
 assert.deepEqual(response.cookies.getAll().map(cookie => cookie.name), ['tobi-auth.0', 'tobi-auth.1']);
 assert.deepEqual(response.headers.getSetCookie().map(value => value.split('=', 1)[0]), ['tobi-auth.0', 'tobi-auth.1']);
 assert.equal(response.cookies.getAll().length,2); assert.ok(response.cookies.getAll().every(c=>c.httpOnly&&c.secure&&c.sameSite==='lax'&&c.path==='/'));
 const large=new NextRequest('https://example.com/auth/login',{method:'POST',headers:{origin:'https://example.com','content-type':'application/x-www-form-urlencoded'},body:'x'.repeat(8193)}); assert.equal((await handleAuth(large)).status,413); assert.equal(response.headers.get('expires'),'0'); assert.equal(response.headers.get('vary'),'Cookie');
 state.logoutError=true;
 const out=await handleAuth(request('/auth/logout','https://example.com','tobi-auth.0=fake; tobi-auth.1=fake; other=untouched'),true);
 assert.equal(out.status,303); assert.equal(out.cookies.get('tobi-auth.0').value,''); assert.equal(out.cookies.get('tobi-auth.1').maxAge,0); assert.equal(out.cookies.has('other'),false);
 state.logoutError=false; state.error={message:'invalid'};
 assert.equal((await handleAuth(request('/auth/login'))).status,401);
 } finally {process.env=prior;}
});
test('proxy forwards refreshed cookies and preserves request headers, without granting access', async () => {
 const prior={...process.env};
 try {
 configure(); state.refresh=true;
 const {NextRequest}=await import('next/server');
 const {proxy}=await import('../proxy.ts');
 const request=new NextRequest('https://example.com/doc',{headers:{'x-request-id':'fixture',cookie:'tobi-auth.0=expired'}});
 const response=await proxy(request);
 assert.equal(request.cookies.get('tobi-auth.0').value,'refreshed');
 assert.equal(response.cookies.get('tobi-auth.0').value,'refreshed');
 assert.equal(response.headers.get('x-middleware-request-x-request-id'),'fixture');
 assert.match(response.headers.get('cache-control'),/private.*no-store/);
 assert.equal(response.headers.get('pragma'),'no-cache');
 assert.equal(await isTobiAdminAuthorized(),false);
 } finally {state.refresh=false;process.env=prior;}
});
test('real admin handlers await auth before store and retain PUT CSRF/JSON/body guards', async () => {
 const prior={...process.env}; let reads=0;
 globalThis.__tobiStoreTest=()=>{reads++;return {configVersion:1};};
 const hook=registerHooks({resolve(specifier,context,nextResolve){
  if(specifier==='@/lib/tobi-config-store') return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export class TobiConfigVersionConflictError extends Error {} export async function getTobiAdminConfigSnapshot(){return globalThis.__tobiStoreTest();} export const saveTobiConfig=getTobiAdminConfigSnapshot;')};
  if(specifier.startsWith('@/')) return nextResolve(new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,context);
  return nextResolve(specifier,context);
 }});
 try {
 configure(); const api=await import('../app/api/config/admin/route.ts?auth-suite');
 const req=(headers={},body='{}')=>new Request('https://example.com/api/config/admin',{method:'PUT',headers,body});
 for(const user of [null,{id:'87654321-1234-1234-1234-123456789abc'}]) {
  state.user=user;
  for(const method of ['GET','PUT']) { const response=await api[method](method==='PUT'?req():new Request('https://example.com/api/config/admin')); assert.equal(response.status,403);assert.match(response.headers.get('cache-control'),/no-store/); }
 }
 assert.equal(reads,0);state.user={id};
 assert.equal((await api.GET(new Request('https://example.com/api/config/admin'))).status,200);assert.equal(reads,1);
 for(const [headers,status] of [[{},403],[{origin:'https://evil'},403],[{origin:'https://example.com'},415],[{origin:'https://example.com','content-type':'application/json','content-length':'999999'},413]]) {
  const response=await api.PUT(req(headers));assert.equal(response.status,status);assert.match(response.headers.get('cache-control'),/no-store/);
 }
 const response=await api.PUT(req({origin:'https://example.com','content-type':'application/json'},JSON.stringify({expectedVersion:1,config:{}})));
 assert.equal(response.status,200);assert.equal(reads,2);
 }finally{hook.deregister();process.env=prior;}
});
test('actual admin/doc page loaders await identity and never import private docs on denial', async () => {
 const ts=await import('typescript');const prior={...process.env};let privateLoads=0;
 globalThis.__privateDocsTest=()=>{privateLoads++;return {};};
 const hook=registerHooks({
  resolve(specifier,context,nextResolve){
   if(specifier==='@/lib/tobi-docs/server-content')return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export function getTobiDocContent(){return globalThis.__privateDocsTest();}')};
   if(specifier.startsWith('@/components/'))return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export default function Component(){return null;} export function InternalAccessCard(){return null;}')};
   if(specifier.startsWith('@/'))return nextResolve(new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,context);
   return nextResolve(specifier,context);
  },
  load(url,context,nextLoad){
   if(url.endsWith('/app/admin/page.tsx')||url.endsWith('/app/doc/page.tsx'))return {shortCircuit:true,format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext}}).outputText};
   return nextLoad(url,context);
  }
 });
 try{
 configure();
 const pages=[await import('../app/admin/page.tsx'),await import('../app/doc/page.tsx')];
 for(const user of [null,{id:'87654321-1234-1234-1234-123456789abc'}]){
  state.user=user;
  for(const page of pages)await page.default();
  assert.equal(privateLoads,0);
 }
 state.user={id};await pages[1].default();assert.equal(privateLoads,1);
 state.error={message:'expired'};await pages[1].default();assert.equal(privateLoads,1);
 }finally{hook.deregister();process.env=prior;}
});
