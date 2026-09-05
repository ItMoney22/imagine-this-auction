const fs=require('node:fs')
const crypto=require('node:crypto')
const path=require('node:path')
const {createClient}=require('../apps/web/node_modules/@supabase/supabase-js')
const dotenv=require('../apps/web/node_modules/dotenv')
const env=dotenv.parse(fs.readFileSync(path.join(__dirname,'../apps/web/.env.local')))
if(env.NEXT_PUBLIC_SUPABASE_URL!=='https://lyijpsppmbgjcvzaxhzn.supabase.co') throw new Error('Unexpected database target')
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const qaPath=path.join(__dirname,'../apps/web/.env.qa')
;(async()=>{
 if(process.argv.includes('--cleanup')) {
   if(!fs.existsSync(qaPath)) return
   const qa=dotenv.parse(fs.readFileSync(qaPath))
   const {error}=await admin.auth.admin.deleteUser(qa.ITA_QA_USER_ID)
   if(error) throw new Error('QA account cleanup failed')
   fs.unlinkSync(qaPath);console.log('Temporary QA account removed.');return
 }
 if(fs.existsSync(qaPath)) throw new Error('Clean up the previous QA account before creating another')
 const email=`ita-qa-${crypto.randomUUID()}@example.invalid`,password=crypto.randomBytes(24).toString('base64url')
 const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{purpose:'Temporary ITA database validation'}})
 if(error||!data.user) throw new Error('Could not create temporary QA account')
 const id=data.user.id
 fs.writeFileSync(qaPath,`ITA_QA_EMAIL=${email}\nITA_QA_PASSWORD=${password}\nITA_QA_USER_ID=${id}\n`,{mode:0o600})
 const {error:profileError}=await admin.from('users').insert({id,email,role:'bidder',is_approved:true,first_name:'QA Collector'})
 if(profileError) throw new Error('Could not create QA profile')
 const client=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
 const {error:signInError}=await client.auth.signInWithPassword({email,password})
 if(signInError) throw new Error('New-project password sign-in failed')
 const own=await client.from('users').select('id,role').eq('id',id).single()
 if(own.error||own.data?.role!=='bidder') throw new Error('Own-profile RLS read failed')
 const escalation=await client.from('users').update({role:'admin'}).eq('id',id)
 if(!escalation.error) throw new Error('Self-escalation was unexpectedly allowed')
 console.log('PASS live authentication, own-profile access and denied self-escalation. Temporary credentials saved only to ignored .env.qa.')
})().catch(e=>{console.error(e.message);process.exitCode=1})
