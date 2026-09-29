import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const { PGlite } = await import(pathToFileURL(path.join(process.env.TEMP, 'ita-db-validation/node_modules/@electric-sql/pglite/dist/index.js')).href)
const source = process.argv[2] || 'D:/Projects for MetaSphere/Imagine This Auction/apps/web/supabase/migrations'
const names = (await fs.readdir(source)).filter(name => /^0\d\d[a-z]?_.*\.sql$/.test(name)).sort()
const db = new PGlite()
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls; create role authenticator; create role supabase_admin;
create schema auth; create schema storage; create schema extensions;
create publication supabase_realtime;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role') $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner uuid,metadata jsonb);
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
grant usage on schema public,auth,storage to anon,authenticated,service_role;
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
`)
const manifest = []
if (process.argv.includes('--bundle')) {
  try {
    await db.exec(await fs.readFile('docs/database/2026-09-05-rebuild/01-core.sql','utf8'))
    await db.exec(await fs.readFile('docs/database/2026-09-05-rebuild/01-core.sql','utf8'))
    console.log('PASS generated rebuild bundle and idempotent replay')
    if (process.argv.includes('--community')) {
      await db.exec(await fs.readFile('docs/database/2026-09-05-rebuild/03-community.sql','utf8'))
      await db.exec(await fs.readFile('docs/database/2026-09-05-rebuild/03-community.sql','utf8'))
      console.log('PASS community bundle and idempotent replay')
      await db.exec(await fs.readFile('apps/web/supabase/migrations/033_database_storage_completion.sql','utf8'))
      await db.exec(await fs.readFile('apps/web/supabase/migrations/033_database_storage_completion.sql','utf8'))
      console.log('PASS catalog storage migration and idempotent replay')
      for (const name of ['034_community_profile_images.sql','035_community_auction_updates.sql']) {
        const sql = await fs.readFile('apps/web/supabase/migrations/'+name,'utf8')
        await db.exec(sql); await db.exec(sql)
        console.log('PASS '+name+' and idempotent replay')
      }
      await db.exec(await fs.readFile('apps/web/supabase/migrations/036_community_questions_chat.sql','utf8'))
      await db.exec(await fs.readFile('apps/web/supabase/migrations/037_community_consignments.sql','utf8'))
      await db.exec(await fs.readFile('apps/web/supabase/migrations/038_community_messages.sql','utf8'))
      const { testCommunityDatabase }=await import('./community-database-cases.mjs')
      await testCommunityDatabase(db)
    }
  } catch (error) { console.error(JSON.stringify({error:error.message,detail:error.detail,context:error.where})); process.exitCode=1 }
  await db.close(); process.exit(process.exitCode ?? 0)
}
for (const name of names) {
  const sql = await fs.readFile(path.join(source,name),'utf8')
  try { await db.exec(sql); manifest.push(name); console.log(`PASS ${name}`) }
  catch(error) { console.error(JSON.stringify({migration:name,error:error.message,position:error.position,detail:error.detail,context:error.where})); await db.close(); process.exit(1) }
}
console.log(JSON.stringify((await db.query(`select tablename,rowsecurity from pg_tables where schemaname='public' order by tablename`)).rows))
if (process.argv.includes('--extensions')) {
  for (const name of ['029_database_rebuild_access.sql','030_community_foundation.sql','031_community_commands.sql']) {
    try { await db.exec(await fs.readFile(path.join('apps/web/supabase/migrations',name),'utf8')); console.log(`PASS ${name}`) }
    catch(error) { console.error(JSON.stringify({migration:name,error:error.message,position:error.position,context:error.where})); await db.close(); process.exit(1) }
  }
  const { testCommunityDatabase } = await import('./community-database-cases.mjs')
  try { await testCommunityDatabase(db) } catch(error) { console.error(JSON.stringify({testFailure:error.message,detail:error.detail,context:error.where})); await db.close(); process.exit(1) }
}
await db.close()
