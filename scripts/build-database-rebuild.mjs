import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const source = process.argv[2] || 'D:/Projects for MetaSphere/Imagine This Auction/apps/web/supabase/migrations'
const destination = path.resolve('docs/database/2026-09-05-rebuild')
await fs.mkdir(destination, { recursive: true })
const names = (await fs.readdir(source)).filter(n => /^0\d\d[a-z]?_.*\.sql$/.test(n)).sort()
const manifest = []
let bundle = `-- Target: Imagine This Auction / lyijpsppmbgjcvzaxhzn. No source data is deleted or imported.
-- Validated in local PostgreSQL. Each migration commits independently for enum compatibility.
create schema if not exists ita_internal;
revoke all on schema ita_internal from public,anon,authenticated;
create table if not exists ita_internal.migrations(name text primary key,sha256 text not null,applied_at timestamptz not null default now());
alter table ita_internal.migrations enable row level security;
`
for (const name of names) {
  const sql = await fs.readFile(path.join(source,name),'utf8')
  const sha256 = createHash('sha256').update(sql).digest('hex')
  manifest.push({ name, sha256, bytes: Buffer.byteLength(sql) })
  bundle += `\nbegin;\ndo $checkpoint$ begin\nif exists(select 1 from ita_internal.migrations where name='${name}' and sha256<>'${sha256}') then raise exception 'Migration checksum mismatch: ${name}'; end if;\nif not exists(select 1 from ita_internal.migrations where name='${name}') then\nexecute $migration$\n${sql}\n$migration$;\ninsert into ita_internal.migrations(name,sha256) values('${name}','${sha256}');\nend if;\nend $checkpoint$;\ncommit;\n`
}
bundle += `\nnotify pgrst,'reload schema';\nselect (select count(*) from ita_internal.migrations) as applied_migrations,(select count(*) from pg_tables where schemaname='public') as public_tables,(select count(*) from pg_tables where schemaname='public' and not rowsecurity) as tables_without_rls;\n`
// Preserve the exact production-applied snapshot even when launch migrations change.
const frozen = await fs.access(path.join(destination,'applied-core-manifest.json')).then(()=>true,()=>false)
const coreName = frozen ? 'candidate-core.sql' : '01-core.sql'
await fs.writeFile(path.join(destination,coreName),bundle)
await fs.writeFile(path.join(destination,frozen ? 'candidate-manifest.json' : 'manifest.json'),JSON.stringify({ project:'lyijpsppmbgjcvzaxhzn',source,excluded:['20240101000004_place_bid_function.sql','20240130000001_fix_place_bid.sql'],migrations:manifest },null,2))
console.log(JSON.stringify({ migrations:manifest.length,bytes:Buffer.byteLength(bundle),file:path.join(destination,coreName),frozen }))
if (process.argv.includes('--community')) {
  let extension = '-- ITA community foundation, enabled only after application QA. Target lyijpsppmbgjcvzaxhzn.\n'
  const extras=[]
  for (const name of ['029_database_rebuild_access.sql','030_community_foundation.sql','031_community_commands.sql']) {
    const original=await fs.readFile(path.join('apps/web/supabase/migrations',name),'utf8')
    const sql=original.replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'')
    const hash=createHash('sha256').update(original).digest('hex')
    extension+=`\nbegin;\ndo $checkpoint$ begin\nif exists(select 1 from ita_internal.migrations where name='${name}' and sha256<>'${hash}') then raise exception 'Migration checksum mismatch: ${name}'; end if;\nif not exists(select 1 from ita_internal.migrations where name='${name}') then\nexecute $migration$\n${sql}\n$migration$;\ninsert into ita_internal.migrations(name,sha256) values('${name}','${hash}');\nend if; end $checkpoint$;\ncommit;\n`
    extras.push({name,sha256:hash})
  }
  extension+="notify pgrst,'reload schema';\nselect (select count(*) from ita_internal.migrations) as applied_migrations,(select count(*) from pg_tables where schemaname='public') as public_tables,(select count(*) from pg_tables where schemaname='public' and not rowsecurity) as tables_without_rls,(select is_enabled from public.feature_flags where flag_name='community_v1') as community_enabled;\n"
  await fs.writeFile(path.join(destination,'03-community.sql'),extension)
  await fs.writeFile(path.join(destination,'community-manifest.json'),JSON.stringify(extras,null,2))
}
