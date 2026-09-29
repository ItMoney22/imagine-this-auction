import assert from 'node:assert/strict'

export async function testCommunityDatabase(db) {
  const a='10000000-0000-4000-8000-000000000001', b='10000000-0000-4000-8000-000000000002', admin='10000000-0000-4000-8000-000000000003'
  const house='20000000-0000-4000-8000-000000000001'
  const cases=[]
  async function check(name,fn) { await fn(); cases.push(name); console.log('PASS '+name) }
  async function cmd(actor,operation,payload) { return (await db.query('select public.community_command($1,$2,$3::jsonb) as result',[actor,operation,JSON.stringify(payload)])).rows[0].result }
  async function asUser(id,sql,args=[]) {
    await db.exec(`set session authorization authenticator; set role authenticated;`)
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[id])
    try { return await db.query(sql,args) } finally { await db.exec('set session authorization postgres; reset role;'); await db.exec("select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false)") }
  }
  await db.exec('grant authenticated,anon to authenticator;')
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6)',[a,'a@example.test',b,'b@example.test',admin,'admin@example.test'])
  await db.exec(`insert into public.users(id,email,role,is_approved) select id,email,case when id='${a}' then 'auctioneer'::public.user_role when id='${admin}' then 'admin'::public.user_role else 'bidder'::public.user_role end,true from auth.users;
  insert into public.auctioneers(id,user_id,company_name,address_line1,city,state,zip_code,is_approved) values('${house}','${a}','Test House','Test','Providence','RI','02901',true);
  update public.feature_flags set is_enabled=true where flag_name='community_v1';`)
  const profile=(handle)=>({handle,display_name:handle,bio:'Collector',city:'Hidden city',region:'RI',interests:['coins'],visibility:'public',show_location:false,dm_policy:'mutual'})
  await check('profile creation strips hidden location and synchronizes handle',async()=>{
    await cmd(a,'profile',profile('house_owner'));await cmd(b,'profile',profile('coin_finder'))
    const row=(await db.query('select city,handle from public.community_profiles where user_id=$1',[b])).rows[0]
    assert.equal(row.city,'');assert.equal(row.handle,'coin_finder')
  })
  await check('handle cooldown and house ownership reject unauthorized changes',async()=>{
    await assert.rejects(cmd(b,'profile',profile('new_handle')),/30 days/)
    await assert.rejects(cmd(b,'house',{id:house,slug:'test_house',about:'Auction house',categories:['coins'],service_radius_miles:25,auto_posts:false}),/House access/)
    await cmd(a,'house',{id:house,slug:'test_house',about:'Auction house',categories:['coins'],service_radius_miles:25,auto_posts:false})
  })
  let post
  await check('follow → post → materialized feed and notification; repeat follow is idempotent',async()=>{
    await cmd(b,'follow',{target_type:'house',target_id:house,following:true});await cmd(b,'follow',{target_type:'house',target_id:house,following:true})
    const result=await cmd(a,'post',{body:'New #coins catalog',house_id:house,visibility:'public',moderation_status:'approved',media_ids:[],tags:['coins'],mentions:['coin_finder']});post=result.id
    assert.equal((await db.query('select count(*)::int as n from public.community_feed_items where user_id=$1 and post_id=$2',[b,post])).rows[0].n,1)
    assert.equal((await db.query("select count(*)::int as n from public.community_notification_events where recipient_id=$1 and category='posts'",[b])).rows[0].n,1)
    assert.equal((await asUser(b,'select id from public.community_posts where id=$1',[post])).rows.length,1)
  })
  await check('client roles cannot execute writes or arbitrary-viewer security helpers',async()=>{
    await assert.rejects(asUser(b,"select public.community_command($1,'profile','{}')",[a]),/permission denied/)
    await assert.rejects(asUser(b,'select public.community_blocked($1,$2)',[a,admin]),/permission denied/)
    await assert.rejects(asUser(b,"update public.users set role='admin' where id=$1",[b]),/permission denied|privileged/)
    await assert.rejects(asUser(b,'select public.create_admin_user($1)',['b@example.test']),/permission denied/)
    const denied=(await asUser(b,'select public.place_bid($1,$2,100) as result',[post,a])).rows[0].result
    assert.equal(denied.success,false);assert.match(denied.error,/not authorized/)
  })
  await check('one-level replies cannot attach to another post or to a reply',async()=>{
    const comment=await cmd(b,'comment',{post_id:post,body:'When is preview?',moderation_status:'approved'})
    const reply=await cmd(a,'comment',{post_id:post,parent_id:comment.id,body:'Saturday.',moderation_status:'approved'})
    await assert.rejects(cmd(b,'comment',{post_id:post,parent_id:reply.id,body:'Nested reply',moderation_status:'approved'}),/top-level/)
  })
  await check('scheduled posts are hidden until due and moderation approval is required',async()=>{
    const scheduled=await cmd(a,'post',{body:'Tomorrow',house_id:house,visibility:'public',moderation_status:'approved',media_ids:[],tags:[],mentions:[],scheduled_at:new Date(Date.now()+86400000).toISOString()})
    assert.equal((await asUser(b,'select id from public.community_posts where id=$1',[scheduled.id])).rows.length,0)
    const pending=await cmd(a,'post',{body:'Review me',house_id:house,visibility:'public',moderation_status:'pending',media_ids:[],tags:[],mentions:[]})
    assert.equal((await asUser(b,'select id from public.community_posts where id=$1',[pending.id])).rows.length,0)
  })
  await check('rate limits are atomic and persist after the threshold',async()=>{
    for(let i=1;i<=4;i++) assert.equal((await db.query("select public.community_take_rate($1,'test',3,60) as allowed",[b])).rows[0].allowed,i<=3)
  })
  await check('block hides posts, profile, house and notifications in both directions',async()=>{
    await cmd(b,'block',{target_id:a,active:true})
    assert.equal((await asUser(b,'select id from public.community_posts where id=$1',[post])).rows.length,0)
    assert.equal((await asUser(b,'select user_id from public.community_profiles where user_id=$1',[a])).rows.length,0)
    assert.equal((await asUser(b,'select id from public.community_houses where id=$1',[house])).rows.length,0)
    assert.equal((await asUser(b,'select id from public.community_notification_events where actor_id=$1',[a])).rows.length,0)
    await assert.rejects(cmd(b,'reaction',{post_id:post,kind:'like',active:true}),/unavailable/)
    await cmd(b,'block',{target_id:a,active:false})
  })
  await check('feature flag disables reads and commands',async()=>{
    await db.exec("update public.feature_flags set is_enabled=false where flag_name='community_v1'")
    assert.equal((await asUser(b,'select id from public.community_posts')).rows.length,0)
    await assert.rejects(cmd(b,'reaction',{post_id:post,kind:'like',active:true}),/not available/)
  })
  await check('catalog assets accept the owning house and reject other uploaders',async()=>{
    const auction='40000000-0000-4000-8000-000000000001'
    await db.query("insert into public.auctions(id,auctioneer_id,title,starts_at,ends_at,status) values($1,$2,'QA auction',now(),now()+interval '1 day','scheduled')",[auction,house])
    await asUser(a,"insert into storage.objects(bucket_id,name) values('lot-images',$1)",[auction+'/owner.jpg'])
    await assert.rejects(asUser(b,"insert into storage.objects(bucket_id,name) values('lot-images',$1)",[auction+'/other.jpg']),/row-level security/)
    await asUser(a,"insert into storage.objects(bucket_id,name) values('ar-models',$1)",[auction+'/owner.usdz'])
  })
  await db.exec("update public.feature_flags set is_enabled=true where flag_name='community_v1'; delete from public.community_blocks;")
  await check('profile photos require ownership and approval; clients cannot impersonate another profile',async()=>{
    const media='60000000-0000-4000-8000-000000000001'
    await db.query("insert into community_media(id,owner_id,path,content_type,bytes,moderation_status) values($1,$2,$3,'image/png',100,'approved')",[media,a,a+'/'+media+'.png'])
    await assert.rejects(db.query("select community_set_image($1,'user',$1,'avatar',$2)",[b,media]),/belong to you/)
    await assert.rejects(asUser(b,"select community_set_image($1,'user',$1,'avatar',$2)",[a,media]),/permission denied/)
    await db.query("select community_set_image($1,'user',$1,'avatar',$2)",[a,media])
    assert.equal((await asUser(b,'select avatar_path from community_profiles where user_id=$1',[a])).rows[0].avatar_path,a+'/'+media+'.png')
    await cmd(a,'profile',profile('house_owner'))
    assert.ok((await db.query('select avatar_path from community_profiles where user_id=$1',[a])).rows[0].avatar_path)
    await db.query("select community_set_image($1,'user',$1,'avatar',null)",[a])
    assert.equal((await db.query('select avatar_path from community_profiles where user_id=$1',[a])).rows[0].avatar_path,null)
  })
  await check('auction announcements publish once and obey house opt-in',async()=>{
    await db.query('update community_houses set auto_posts=true where id=$1',[house])
    await db.query("update auctions set starts_at=now()+interval '10 minutes' where auctioneer_id=$1",[house])
    await db.exec('select community_auction_announcements();')
    const count=async()=>(await db.query('select count(*)::integer as n from community_posts where auto_key is not null')).rows[0].n
    assert.equal(await count(),2)
    await db.exec('select community_auction_announcements();')
    assert.equal(await count(),2)
    await db.query('update community_houses set auto_posts=false where id=$1',[house])
    await db.query("update auctions set status='live' where auctioneer_id=$1",[house])
    await db.exec('select community_auction_announcements();')
    assert.equal(await count(),2)
    assert.equal((await db.query("select count(*)::integer as n from community_auction_updates where kind='live'")).rows[0].n,1)
  })
  const auction='40000000-0000-4000-8000-000000000001', lot='70000000-0000-4000-8000-000000000001'
  await db.query("insert into lots(id,auction_id,lot_number,title) values($1,$2,1,'QA coin')",[lot,auction])
  const discuss=async(actor,operation,payload)=>(await db.query('select community_discuss($1,$2,$3::jsonb) as result',[actor,operation,JSON.stringify(payload)])).rows[0].result
  let question
  await check('lot question → house answer with answered badge data; outsiders cannot answer or pin',async()=>{
    question=(await discuss(b,'ask',{lot_id:lot,body:'Can you show the reverse?',photo_request:true,moderation_status:'approved'})).id
    await assert.rejects(discuss(b,'answer',{id:question,body:'Forged answer',moderation_status:'approved'}),/House access/)
    await discuss(a,'answer',{id:question,body:'The reverse has light wear.',moderation_status:'approved'})
    const row=(await asUser(b,'select answer,answered_at,photo_request from community_questions where id=$1',[question])).rows[0]
    assert.equal(row.answer,'The reverse has light wear.');assert.ok(row.answered_at);assert.equal(row.photo_request,true)
    await assert.rejects(discuss(b,'pin',{id:question,active:true}),/House access/)
    await discuss(a,'pin',{id:question,active:true})
    assert.equal((await asUser(b,'select pinned from community_questions where id=$1',[question])).rows[0].pinned,true)
  })
  await check('chat restricts slow mode, paused rooms, impersonation and the 24-hour cutoff',async()=>{
    await discuss(b,'chat',{auction_id:auction,body:'Hello collectors',moderation_status:'approved'})
    await assert.rejects(discuss(b,'chat',{auction_id:auction,body:'Too soon',moderation_status:'approved'}),/Slow mode/)
    await assert.rejects(asUser(b,"select community_discuss($1,'chat',$2::jsonb)",[a,JSON.stringify({auction_id:auction,body:'Fake house'})]),/permission denied/)
    await discuss(a,'room-settings',{auction_id:auction,slow_seconds:20,locked:true})
    await assert.rejects(discuss(b,'chat',{auction_id:auction,body:'Paused',moderation_status:'approved'}),/paused/)
    await db.query("update auctions set starts_at=now()-interval '3 days',ends_at=now()-interval '2 days',status='ended' where id=$1",[auction])
    await assert.rejects(discuss(b,'chat',{auction_id:auction,body:'Closed',moderation_status:'approved'}),/24 hours/)
  })
  await check('discussion moderation hides pending content and blocks non-admin approval',async()=>{
    const pending=(await discuss(b,'ask',{lot_id:lot,body:'Review this question',moderation_status:'pending'})).id
    await assert.rejects(db.query("select community_review_discussion($1,'question',$2,true,null,'Checked facts')",[b,pending]),/Admin access/)
    await db.query("select community_review_discussion($1,'question',$2,true,null,'Checked facts')",[admin,pending])
    assert.equal((await asUser(a,'select id from community_questions where id=$1',[pending])).rows.length,1)
    await cmd(b,'block',{target_id:a,active:true})
    assert.equal((await asUser(b,'select id from community_questions where id=$1',[question])).rows.length,0)
    assert.equal((await asUser(b,'select id from community_room_messages where auction_id=$1',[auction])).rows.length,0)
    await cmd(b,'block',{target_id:a,active:false})
  })
  const consign=async(actor,operation,payload)=>(await db.query('select community_consign($1,$2,$3::jsonb) as result',[actor,operation,JSON.stringify(payload)])).rows[0].result
  const requestPayload={title:'QA coin collection',description:'An inherited collection of coins for auction.',category:'coins',city:'Providence',region:'RI',quantity:12,timeframe:'Within two months',visibility:'all',radius_miles:25,media_ids:[],moderation_status:'approved'}
  await check('local consignments enforce distance without exposing stored coordinates',async()=>{
    await assert.rejects(consign(b,'create',{...requestPayload,visibility:'local'}),/approximate location/)
    await consign(b,'location',{subject_id:b,latitude:41.824,longitude:-71.4128})
    await consign(a,'location',{subject_id:house,latitude:40.7128,longitude:-74.006})
    const request=await consign(b,'create',{...requestPayload,visibility:'local'})
    assert.equal((await asUser(a,'select id from community_consignments where id=$1',[request.id])).rows.length,0)
    await consign(a,'location',{subject_id:house,latitude:41.83,longitude:-71.41})
    assert.equal((await asUser(a,'select id from community_consignments where id=$1',[request.id])).rows.length,1)
    await assert.rejects(asUser(a,'select latitude from community_locations'),/permission denied/)
    await assert.rejects(consign(b,'location',{subject_id:house,latitude:0,longitude:0}),/Location access/)
  })
  await check('consignor accepts one offer; claims are exclusive and other houses cannot read competing quotes',async()=>{
    const c='10000000-0000-4000-8000-000000000004',otherHouse='20000000-0000-4000-8000-000000000002'
    await db.query("insert into auth.users(id,email) values($1,'c@example.test')",[c]);await db.query("insert into users(id,email,role,is_approved) values($1,'c@example.test','auctioneer',true)",[c])
    await db.query("insert into auctioneers(id,user_id,company_name,address_line1,city,state,zip_code,is_approved) values($1,$2,'Other QA House','QA','Providence','RI','02901',true)",[otherHouse,c])
    const request=await consign(b,'create',requestPayload)
    const offer={id:request.id,house_id:house,kind:'claim',commission_percent:15,pickup_offer:true,sale_date:null,message:'We can evaluate this collection.',moderation_status:'approved'}
    const first=await consign(a,'offer',offer)
    await assert.rejects(consign(c,'offer',{...offer,house_id:otherHouse}),/unique/)
    const second=await consign(c,'offer',{...offer,house_id:otherHouse,kind:'quote',commission_percent:12})
    assert.equal((await asUser(a,'select id from community_consignment_offers where request_id=$1',[request.id])).rows.length,1)
    assert.equal((await asUser(b,'select id from community_consignment_offers where request_id=$1',[request.id])).rows.length,2)
    await assert.rejects(consign(a,'accept',{id:first.id}),/Only the consignor/)
    const intake=await consign(b,'accept',{id:second.id})
    await assert.rejects(consign(b,'accept',{id:first.id}),/Only the consignor/)
    assert.equal((await db.query('select count(*)::integer as n from community_consignment_intakes where request_id=$1',[request.id])).rows[0].n,1)
    await assert.rejects(consign(c,'intake',{id:intake.id,status:'completed'}),/one step/)
    for(const status of ['received','catalogued','completed'])await consign(c,'intake',{id:intake.id,status})
    await consign(b,'rate',{id:intake.id,stars:5,body:'Clear communication.',moderation_status:'approved'})
    await consign(c,'rate',{id:intake.id,stars:5,body:'Well prepared collection.',moderation_status:'approved'})
    assert.equal((await db.query('select count(*)::integer as n from community_consignment_ratings where intake_id=$1',[intake.id])).rows[0].n,2)
  })
  await check('private messages enforce mutual follows, recipient preferences, report-only review and blocks',async()=>{
    const message=async(actor,operation,payload)=>(await db.query('select community_message($1,$2,$3::jsonb) as result',[actor,operation,JSON.stringify(payload)])).rows[0].result
    await assert.rejects(message(b,'start',{recipient_id:a}),/privacy settings/)
    await cmd(a,'follow',{target_type:'user',target_id:b,following:true});await cmd(b,'follow',{target_type:'user',target_id:a,following:true})
    const conversation=await message(b,'start',{recipient_id:a})
    assert.equal((await message(a,'start',{recipient_id:b})).id,conversation.id)
    const sent=await message(b,'send',{id:conversation.id,body:'Can we coordinate pickup?',media_ids:[],moderation_status:'approved'})
    assert.equal((await asUser(a,'select body from community_messages where id=$1',[sent.id])).rows[0].body,'Can we coordinate pickup?')
    assert.equal((await asUser(admin,'select id from community_messages where id=$1',[sent.id])).rows.length,0)
    await assert.rejects(asUser(a,"select community_message($1,'read',$2::jsonb)",[b,JSON.stringify({id:conversation.id})]),/permission denied/)
    const pending=await message(b,'send',{id:conversation.id,body:'Please review this message',media_ids:[],moderation_status:'pending'})
    assert.equal((await asUser(a,'select id from community_messages where id=$1',[pending.id])).rows.length,0)
    const report=await message(b,'report',{id:pending.id,reason:'Please review my held message.'})
    await assert.rejects(db.query('select community_review_message($1,$2,true,$3)',[a,report.id,'Checked content']),/Admin access/)
    await db.query('select community_review_message($1,$2,true,$3)',[admin,report.id,'Checked content'])
    assert.equal((await asUser(a,'select id from community_messages where id=$1',[pending.id])).rows.length,1)
    await cmd(a,'profile',{...profile('house_owner'),dm_policy:'closed'})
    await assert.rejects(message(b,'send',{id:conversation.id,body:'Closed recipient',media_ids:[],moderation_status:'approved'}),/not accepting/)
    await cmd(b,'block',{target_id:a,active:true})
    assert.equal((await asUser(a,'select id from community_conversations where id=$1',[conversation.id])).rows.length,0)
    assert.equal((await asUser(b,'select id from community_messages where conversation_id=$1',[conversation.id])).rows.length,0)
    await cmd(b,'block',{target_id:a,active:false})
  })
  return cases
}
