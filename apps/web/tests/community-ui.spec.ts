import { expect, test } from '@playwright/test'

const owner='10000000-0000-4000-8000-000000000001', bidder='10000000-0000-4000-8000-000000000002', house='20000000-0000-4000-8000-000000000001'
const profile={user_id:bidder,handle:'coin_finder',display_name:'QA Collector',bio:'QA sample collector profile.',interests:['coins','vintage'],city:'Providence',region:'RI',visibility:'public',show_location:true,dm_policy:'mutual',reputation_tier:'New',created_at:'2026-09-05T08:00:00Z',updated_at:'2026-09-05T08:00:00Z'}
const sampleHouse={id:house,owner_id:owner,slug:'sample_house',company_name:'QA Sample Auction House',about:'Sample profile for interface testing.',city:'Providence',region:'RI',categories:['coins'],is_approved:true,service_radius_miles:25,auto_posts:false}
test('feature remains unavailable until enabled on the database',async({page})=>{
  await page.goto('/feed')
  await expect(page.getByRole('heading',{name:'Your collecting community is coming soon'})).toBeVisible()
})
test('mobile composer, feed, reactions, follow and profile settings',async({page})=>{
  test.skip(!process.env.ITA_QA_EMAIL || !process.env.ITA_QA_PASSWORD, 'Requires the temporary QA account created by scripts/smoke-new-database.cjs')
  await page.goto('/login')
  await page.getByRole('textbox',{name:'Email Address'}).fill(process.env.ITA_QA_EMAIL!)
  await page.getByRole('textbox',{name:'Password',exact:true}).fill(process.env.ITA_QA_PASSWORD!)
  await page.getByRole('button',{name:'Sign In',exact:true}).click()
  await expect(page).not.toHaveURL(/\/login/)
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
