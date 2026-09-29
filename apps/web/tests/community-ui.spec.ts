import { expect, test } from '@playwright/test'

const owner='10000000-0000-4000-8000-000000000001', bidder='10000000-0000-4000-8000-000000000002', house='20000000-0000-4000-8000-000000000001'
const profile={user_id:bidder,handle:'coin_finder',display_name:'QA Collector',bio:'QA sample collector profile.',interests:['coins','vintage'],city:'Providence',region:'RI',visibility:'public',show_location:true,dm_policy:'mutual',reputation_tier:'New',created_at:'2026-09-05T08:00:00Z',updated_at:'2026-09-05T08:00:00Z'}
const sampleHouse={id:house,owner_id:owner,slug:'sample_house',company_name:'QA Sample Auction House',about:'Sample profile for interface testing.',city:'Providence',region:'RI',categories:['coins'],is_approved:true,service_radius_miles:25,auto_posts:false}
test('feature remains unavailable until enabled on the database',async({page})=>{
  await page.route('**/api/community/status',route=>route.fulfill({json:{enabled:false}}))
  await page.goto('/feed')
  await expect(page.getByRole('heading',{name:'Your collecting community is coming soon'})).toBeVisible()
})

test('live local API creates a profile and publishes a moderated post',async({page})=>{
  test.skip(!process.env.ITA_QA_USER_ID,'Requires temporary QA account')
  await page.goto('/login')
  await page.getByRole('textbox',{name:'Email Address'}).fill(process.env.ITA_QA_EMAIL!)
  await page.getByRole('textbox',{name:'Password',exact:true}).fill(process.env.ITA_QA_PASSWORD!)
  await page.getByRole('button',{name:'Sign In',exact:true}).click()
  await expect(page).not.toHaveURL(/\/login/)
  await page.waitForLoadState('networkidle')
  const response=await page.request.post('/api/community/profiles',{data:{handle:'qa_'+process.env.ITA_QA_USER_ID!.slice(0,8),display_name:'Temporary QA Collector',bio:'Temporary automated validation.',interests:['coins'],city:'',region:'',visibility:'public',show_location:false,dm_policy:'mutual'}})
  expect(response.ok(),await response.text()).toBe(true)
  const published=await page.request.post('/api/community/posts',{data:{body:'Temporary integration check: sharing a collecting update. This test post will be removed.',visibility:'public',media_ids:[]}})
  expect(published.ok(),await published.text()).toBe(true)
  const post=await published.json()
  expect(post.moderation_status).toBe('approved')
  const feed=await page.request.get('/api/community/feed?mode=latest')
  expect(feed.ok(),await feed.text()).toBe(true)
  expect((await feed.json()).posts.some((p:{id:string})=>p.id===post.id)).toBe(true)
  const hidden=await page.request.post('/api/community/hide-post',{data:{id:post.id}})
  expect(hidden.ok(),await hidden.text()).toBe(true)
})

test('consignor creates a request and accepts a house quote into an intake',async({page})=>{
  const requestId='90000000-0000-4000-8000-000000000001',offerId='90000000-0000-4000-8000-000000000002'
  let request:Record<string,unknown>|null=null
  await page.route('**/api/community/consignments**',async route=>{
    if(route.request().method()==='POST'){
      const body=route.request().postDataJSON()
      if(body.operation==='create')request={...body,id:requestId,owner_id:bidder,status:'open',moderation_status:'approved',media:[],offers:[],intake:null}
      if(body.operation==='accept')request={...request!,status:'matched',intake:{id:'90000000-0000-4000-8000-000000000003',status:'planned'},offers:[{id:offerId,house_id:house,kind:'quote',commission_percent:15,pickup_offer:true,sale_date:null,message:'We can collect and catalog the collection.',status:'accepted',house:{company_name:'QA Sample Auction House'}}]}
      return route.fulfill({json:{id:requestId,moderation_status:'approved'}})
    }
    return route.fulfill({json:{requests:request?[request]:[],houses:[],userId:bidder}})
  })
  await page.goto('/consign')
  await page.getByText('Share an item or estate',{exact:true}).click()
  await page.getByLabel('What are you selling?').fill('QA coin collection')
  await page.getByLabel('Description',{exact:true}).fill('A sample collection of twelve coins for interface testing.')
  await page.getByLabel('Category',{exact:true}).fill('coins')
  await page.getByLabel('Approximate item count').fill('12')
  await page.getByLabel('City',{exact:true}).fill('Providence')
  await page.getByLabel('State / region').fill('RI')
  await page.getByLabel('Preferred timeframe').fill('Within two months')
  await page.getByRole('button',{name:'Share consignment request'}).click()
  await expect(page.getByText('Your request is ready for eligible houses to view.')).toBeVisible()
  request={...request!,offers:[{id:offerId,house_id:house,kind:'quote',commission_percent:15,pickup_offer:true,sale_date:null,message:'We can collect and catalog the collection.',status:'pending',house:{company_name:'QA Sample Auction House'}}]}
  await page.getByRole('link',{name:'View request & responses'}).click()
  await page.getByRole('button',{name:'Accept offer & create intake'}).click()
  await expect(page.getByRole('heading',{name:'Consignment intake',exact:true})).toBeVisible()
  await expect(page.getByText('Status: planned',{exact:true})).toBeVisible()
  await page.evaluate(()=>window.scrollTo(0,0))
  await page.screenshot({path:'../../docs/qa/community/consignment-mobile.png',fullPage:true})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
})
test('mobile composer, feed, reactions, follow and profile settings',async({page})=>{
  test.skip(!process.env.ITA_QA_EMAIL || !process.env.ITA_QA_PASSWORD, 'Requires the temporary QA account created by scripts/smoke-new-database.cjs')
  await page.goto('/login')
  await page.getByRole('textbox',{name:'Email Address'}).fill(process.env.ITA_QA_EMAIL!)
  await page.getByRole('textbox',{name:'Password',exact:true}).fill(process.env.ITA_QA_PASSWORD!)
  await page.getByRole('button',{name:'Sign In',exact:true}).click()
  await expect(page).not.toHaveURL(/\/login/)
  await page.waitForLoadState('networkidle')
  const posts=[{id:'30000000-0000-4000-8000-000000000001',author_id:owner,house_id:house,body:'QA sample: a collection of coins with a story to tell. What do you collect?',published_at:'2026-09-05T09:00:00Z',scheduled_at:null,moderation_status:'approved',visibility:'public',lot_id:null,auction_id:null,house:sampleHouse,profile:{display_name:'QA House Owner',handle:'house_owner'},comments:[],reactions:[],media:[]}]
  let following=false
  await page.route('**/api/community/**',async route=>{
    const url=new URL(route.request().url()), endpoint=url.pathname.split('/')[3]
    const body=route.request().method()==='POST'?route.request().postDataJSON():null
    let json:unknown={}
    if(endpoint==='status') json={enabled:true}
    else if(endpoint==='me') json={user:{id:bidder,role:'bidder'},profile,houses:[],follows:following?[{target_type:'house',target_id:house}]:[],preferences:[]}
    else if(endpoint==='feed') json={posts,next:null}
    else if(endpoint==='houses') json={houses:[sampleHouse],auctions:[]}
    else if(endpoint==='profiles') json={profiles:[profile]}
    else if(endpoint==='posts' && body) { posts.unshift({...posts[0],id:'30000000-0000-4000-8000-000000000002',body:body.body,author_id:bidder,house_id:null as unknown as string,house:null as unknown as typeof sampleHouse,profile:{display_name:profile.display_name,handle:profile.handle}});json={id:posts[0].id,moderation_status:'approved'} }
    else if(endpoint==='draft') json={text:'QA sample: my first coin find.'}
    else if(endpoint==='reactions') json={saved:true}
    else if(endpoint==='follows') { following=body.following;json={following} }
    else if(endpoint==='preferences') json={saved:true}
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(json)})
  })
  await page.goto('/feed')
  await expect(page.getByText('QA sample: a collection of coins',{exact:false})).toBeVisible()
  await page.getByLabel('Post text').fill('QA sample: sharing my first coin find.')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({path:'../../docs/qa/community/composer-before-submit.png',fullPage:true})
  await page.getByRole('button',{name:'Make shorter',exact:true}).click()
  await expect(page.getByRole('region',{name:'AI suggestion'})).toBeVisible()
  await expect(page.getByLabel('Post text')).toHaveValue('QA sample: sharing my first coin find.')
  await page.getByRole('button',{name:'Dismiss',exact:true}).click()
  await page.getByRole('button',{name:'Share post',exact:true}).click()
  await expect(page.getByText('Your post is published.')).toBeVisible()
  await expect(page.getByText('QA sample: sharing my first coin find.',{exact:true})).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({path:'../../docs/qa/community/feed-mobile.png',fullPage:true})
  await page.getByRole('button',{name:'Latest',exact:true}).click()
  await expect(page.getByRole('button',{name:'Latest',exact:true})).toHaveAttribute('aria-pressed','true')
  await page.goto('/h/sample_house')
  await expect(page.getByRole('heading',{name:'QA Sample Auction House'})).toBeVisible()
  await page.getByRole('button',{name:'Follow',exact:true}).click()
  await expect(page.getByRole('button',{name:'Following',exact:true})).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({path:'../../docs/qa/community/house-mobile.png',fullPage:true})
  await page.goto('/settings/community')
  await expect(page.getByRole('heading',{name:'Your collector profile'})).toBeVisible()
  await expect(page.getByRole('textbox',{name:'Display name',exact:true})).toHaveValue('QA Collector')
  await page.getByRole('button',{name:'Save profile',exact:true}).click()
  await expect(page.getByText('Your profile is saved.')).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({path:'../../docs/qa/community/profile-mobile.png',fullPage:true})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
})

test('lot question, condition request, house answer and auction chat controls',async({page})=>{
  test.skip(!process.env.ITA_QA_LOT_ID,'Requires temporary discussion fixtures')
  const lot=process.env.ITA_QA_LOT_ID!,auction=process.env.ITA_QA_AUCTION_ID!
  let manager=false,paused=false
  const questions:Record<string,unknown>[]=[]
  const messages:Record<string,unknown>[]=[]
  await page.route('**/api/community/status',route=>route.fulfill({json:{enabled:true}}))
  await page.route('**/api/community/discussions**',async route=>{
    const request=route.request(),url=new URL(request.url())
    if(request.method()==='POST'){
      const body=request.postDataJSON()
      if(body.operation==='ask')questions.push({id:'80000000-0000-4000-8000-000000000001',body:body.body,photo_request:body.photo_request,asker_id:bidder,moderation_status:'approved',created_at:new Date().toISOString()})
      if(body.operation==='answer')Object.assign(questions[0],{answer:body.body,answered_at:new Date().toISOString()})
      if(body.operation==='chat')messages.push({id:'80000000-0000-4000-8000-000000000002',body:body.body,author_id:bidder,moderation_status:'approved',created_at:new Date().toISOString()})
      if(body.operation==='room-settings')paused=body.locked
      return route.fulfill({json:{saved:true,moderation_status:'approved'}})
    }
    return route.fulfill({json:{rows:url.searchParams.get('mode')==='questions'?questions:messages,auction:{id:auction,title:'QA Sample Auction',status:'live',ends_at:new Date(Date.now()+3600000).toISOString()},settings:{slow_seconds:5,locked:paused},canManage:manager,userId:bidder}})
  })
  await page.goto(`/lots/${lot}`)
  const discussion=page.getByRole('region',{name:'Ask the auctioneer'})
  await discussion.getByRole('textbox',{name:'Your question'}).fill('Can you show the reverse of this coin?')
  await discussion.getByLabel('Request a condition photo').check()
  await discussion.getByRole('button',{name:'Ask question',exact:true}).click()
  await expect(discussion.getByText('Photo requested',{exact:true})).toBeVisible()
  manager=true
  await discussion.getByRole('button',{name:'Refresh',exact:true}).click()
  await discussion.getByText('Answer this question',{exact:true}).click()
  await discussion.getByRole('textbox',{name:'House answer'}).fill('The reverse has light wear around the rim.')
  await discussion.getByRole('button',{name:'Publish answer'}).click()
  await expect(discussion.getByText('Answered by house',{exact:true})).toBeVisible()
  await page.evaluate(()=>window.scrollTo(0,0))
  await page.screenshot({fullPage:true,path:'../../docs/qa/community/lot-questions-mobile.png'})
  await page.goto(`/auctions/${auction}`)
  const room=page.getByRole('region',{name:'Auction chat'})
  await room.getByRole('textbox',{name:'Your message'}).fill('Hello, fellow collectors!')
  await room.getByRole('button',{name:'Send message',exact:true}).click()
  await expect(room.getByText('Hello, fellow collectors!',{exact:true})).toBeVisible()
  await room.getByLabel('Pause chat').check()
  await room.getByRole('button',{name:'Save chat settings'}).click()
  manager=false
  await room.getByRole('button',{name:'Refresh',exact:true}).click()
  await expect(room.getByText('The auction house has paused chat.')).toBeVisible()
  await page.evaluate(()=>window.scrollTo(0,0))
  await page.screenshot({fullPage:true,path:'../../docs/qa/community/auction-chat-mobile.png'})
})
