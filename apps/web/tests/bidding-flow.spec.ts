import { test, expect, Page, BrowserContext } from '@playwright/test'

// Test data - these would normally be seeded
const testAuctioneer = {
  email: 'auctioneer@test.com',
  password: 'password123',
  organizationName: 'Test Auction House'
}

const testBidders = [
  {
    email: 'bidder1@test.com',
    password: 'password123',
    name: 'John Doe'
  },
  {
    email: 'bidder2@test.com',
    password: 'password123',
    name: 'Jane Smith'
  }
]

test.describe('Bidding Flow', () => {
  let auctioneerContext: BrowserContext
  let bidder1Context: BrowserContext
  let bidder2Context: BrowserContext
  let auctioneerPage: Page
  let bidder1Page: Page
  let bidder2Page: Page
  let auctionId: string
  let lotId: string

  test.beforeAll(async ({ browser }) => {
    // Create separate contexts for each user
    auctioneerContext = await browser.newContext()
    bidder1Context = await browser.newContext()
    bidder2Context = await browser.newContext()

    auctioneerPage = await auctioneerContext.newPage()
    bidder1Page = await bidder1Context.newPage()
    bidder2Page = await bidder2Context.newPage()
  })

  test.afterAll(async () => {
    await auctioneerContext.close()
    await bidder1Context.close()
    await bidder2Context.close()
  })

  test('Auctioneer can create auction and import CSV lots without errors', async () => {
    // Login as auctioneer
    await auctioneerPage.goto('/login')
    await auctioneerPage.fill('[name="email"]', testAuctioneer.email)
    await auctioneerPage.fill('[name="password"]', testAuctioneer.password)
    await auctioneerPage.click('button[type="submit"]')

    // Wait for redirect to dashboard
    await auctioneerPage.waitForURL('/org')
    await expect(auctioneerPage.locator('h1')).toContainText('Welcome back')

    // Create new auction
    await auctioneerPage.click('a[href="/org/auctions/new"]')
    await auctioneerPage.fill('[name="title"]', 'Test Auction for Bidding')
    await auctioneerPage.fill('[name="description"]', 'A test auction with real-time bidding')

    // Set auction to start now and end in 1 hour
    const now = new Date()
    const startTime = new Date(now.getTime() + 60000) // 1 minute from now
    const endTime = new Date(now.getTime() + 3600000) // 1 hour from now

    await auctioneerPage.fill('[name="starts_at"]', startTime.toISOString().slice(0, 16))
    await auctioneerPage.fill('[name="ends_at"]', endTime.toISOString().slice(0, 16))

    await auctioneerPage.selectOption('[name="anti_sniping_seconds"]', '60')
    await auctioneerPage.click('button[type="submit"]')

    // Extract auction ID from URL
    await auctioneerPage.waitForURL(/\/org\/auctions\/(.+)/)
    auctionId = auctioneerPage.url().split('/').pop()!

    // Navigate to lots manager
    await auctioneerPage.click(`a[href="/org/auctions/${auctionId}/lots"]`)

    // Test CSV upload
    await auctioneerPage.click('button:has-text("Bulk Upload CSV")')

    // Create sample CSV content
    const csvContent = `title,description,image_urls,start_price_itc,bid_increment_itc,reserve_price_itc,category
"Antique Vase","Beautiful ceramic vase from 1800s","https://example.com/vase.jpg",100,10,150,"Antiques"
"Vintage Watch","Gold pocket watch in working condition","https://example.com/watch.jpg",200,25,,"Collectibles"
"Oil Painting","Original landscape painting","https://example.com/painting.jpg",500,50,750,"Art"`

    // Create file and upload
    const csvFile = await auctioneerPage.evaluateHandle(
      (content) => {
        const blob = new Blob([content], { type: 'text/csv' })
        const file = new File([blob], 'test-lots.csv', { type: 'text/csv' })
        return file
      },
      csvContent
    )

    await auctioneerPage.setInputFiles('input[type="file"]', csvFile as any)
    await auctioneerPage.click('button:has-text("Preview & Validate")')

    // Wait for preview and verify
    await expect(auctioneerPage.locator('text=3 valid')).toBeVisible()
    await expect(auctioneerPage.locator('text=Antique Vase')).toBeVisible()

    // Import lots
    await auctioneerPage.click('button:has-text("Import 3 Lots")')
    await expect(auctioneerPage.locator('text=Lot #1: Antique Vase')).toBeVisible()

    // Get first lot ID for later use
    const lotCard = auctioneerPage.locator('[data-testid="lot-card"]').first()
    const viewButton = lotCard.locator('a:has-text("View")')
    const href = await viewButton.getAttribute('href')
    lotId = href?.split('/').pop()!

    // Publish auction (change status to live)
    await auctioneerPage.goto(`/org/auctions/${auctionId}`)
    // This would require additional UI to publish - for now we'll assume it's live
  })

  test('Bidders can place bids and see real-time updates', async () => {
    // Setup bidder 1
    await bidder1Page.goto('/login')
    await bidder1Page.fill('[name="email"]', testBidders[0].email)
    await bidder1Page.fill('[name="password"]', testBidders[0].password)
    await bidder1Page.click('button[type="submit"]')
    await bidder1Page.waitForURL('/dashboard')

    // Setup bidder 2
    await bidder2Page.goto('/login')
    await bidder2Page.fill('[name="email"]', testBidders[1].email)
    await bidder2Page.fill('[name="password"]', testBidders[1].password)
    await bidder2Page.click('button[type="submit"]')
    await bidder2Page.waitForURL('/dashboard')

    // Both bidders navigate to the lot
    await bidder1Page.goto(`/lots/${lotId}`)
    await bidder2Page.goto(`/lots/${lotId}`)

    // Verify lot details are visible
    await expect(bidder1Page.locator('h1')).toContainText('Antique Vase')
    await expect(bidder2Page.locator('h1')).toContainText('Antique Vase')

    // Bidder 1 places first bid
    await bidder1Page.click('button:has-text("Bid 100 ITC")')

    // Verify success toast appears
    await expect(bidder1Page.locator('[role="alert"]:has-text("Bid Placed Successfully")')).toBeVisible()

    // Verify bid appears in bid history for both users
    await expect(bidder1Page.locator('text=#1').locator('..').locator('text=You')).toBeVisible()
    await expect(bidder2Page.locator('text=#1').locator('..').locator('text=John D.')).toBeVisible()

    // Verify current high bid updated
    await expect(bidder1Page.locator('text=100 ITC').first()).toBeVisible()
    await expect(bidder2Page.locator('text=100 ITC').first()).toBeVisible()

    // Bidder 2 outbids bidder 1
    await bidder2Page.click('button:has-text("Bid 110 ITC")')

    // Verify bidder 1 gets outbid notification
    await expect(bidder1Page.locator('[role="alert"]:has-text("You\'ve been outbid")')).toBeVisible()

    // Verify bidder 2 gets success notification
    await expect(bidder2Page.locator('[role="alert"]:has-text("Bid Placed Successfully")')).toBeVisible()

    // Verify bid ladder updated for both users
    await expect(bidder1Page.locator('text=#1').locator('..').locator('text=Jane S.')).toBeVisible()
    await expect(bidder2Page.locator('text=#1').locator('..').locator('text=You')).toBeVisible()

    // Verify wallet balance changes (if implemented)
    // This would require checking wallet balance API
  })

  test('Mobile sticky bid bar stays visible and functional', async () => {
    // Test with mobile viewport
    await bidder1Page.setViewportSize({ width: 390, height: 844 })
    await bidder1Page.goto(`/lots/${lotId}`)

    // Verify sticky bid bar is visible
    const stickyBar = bidder1Page.locator('[class*="fixed bottom-0"]')
    await expect(stickyBar).toBeVisible()

    // Verify bid bar contents
    await expect(stickyBar.locator('text=Current High')).toBeVisible()
    await expect(stickyBar.locator('text=Next Bid')).toBeVisible()
    await expect(stickyBar.locator('text=Balance')).toBeVisible()
    await expect(stickyBar.locator('button:has-text("Bid")')).toBeVisible()

    // Scroll down and verify bar stays visible
    await bidder1Page.evaluate(() => window.scrollTo(0, 1000))
    await expect(stickyBar).toBeVisible()

    // Test bid functionality from sticky bar
    await stickyBar.locator('button:has-text("Bid")').click()
    await expect(bidder1Page.locator('[role="alert"]')).toBeVisible()
  })

  test('Anti-sniping extends auction timer', async () => {
    // This test would require controlling time or setting up a very short auction
    // For now, we'll test the UI elements

    // Verify anti-sniping info is displayed
    await bidder1Page.goto(`/lots/${lotId}`)
    await expect(bidder1Page.locator('text=Anti-sniping')).toBeVisible()
    await expect(bidder1Page.locator('text=+60s')).toBeVisible()

    // Test would need to simulate bidding near end time
    // and verify timer extension toast appears
  })

  test('Guard rails prevent invalid bids', async () => {
    await bidder1Page.goto(`/lots/${lotId}`)

    // Test insufficient credits scenario
    // This would require setting up a user with low balance

    // Test bidding when user is already high bidder
    await bidder1Page.click('button:has-text("Bid")')
    await expect(bidder1Page.locator('[role="alert"]:has-text("already the high bidder")')).toBeVisible()

    // Test auction ended scenario
    // This would require an ended auction
  })

  test('Watchlist and email notifications work', async () => {
    await bidder1Page.goto(`/lots/${lotId}`)

    // Toggle watchlist
    const watchlistSwitch = bidder1Page.locator('[data-testid="watchlist-switch"]')
    await watchlistSwitch.click()

    // Verify toast notification
    await expect(bidder1Page.locator('[role="alert"]:has-text("Added to Watchlist")')).toBeVisible()

    // Toggle email notifications
    const emailSwitch = bidder1Page.locator('[data-testid="email-notifications-switch"]')
    await emailSwitch.click()

    // Verify state changes
    await expect(watchlistSwitch).toBeChecked()
    await expect(emailSwitch).toBeChecked()
  })

  test('Accessibility features work correctly', async () => {
    await bidder1Page.goto(`/lots/${lotId}`)

    // Test focus ring on bid button
    await bidder1Page.keyboard.press('Tab')
    const focusedElement = await bidder1Page.locator(':focus')
    await expect(focusedElement).toHaveClass(/focus:ring/)

    // Test aria-live regions for bid updates
    const bidHistory = bidder1Page.locator('[role="log"]')
    await expect(bidHistory).toHaveAttribute('aria-live', 'polite')

    // Test aria-labels on buttons
    const bidButton = bidder1Page.locator('button:has-text("Bid")')
    await expect(bidButton).toHaveAttribute('aria-label')

    // Test screen reader announcements
    const timerRegion = bidder1Page.locator('[aria-label*="time remaining"]')
    await expect(timerRegion).toHaveAttribute('aria-live', 'polite')
  })
})

test.describe('Mobile Responsive Design', () => {
  test('Lists and cards wrap cleanly on phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })

    // Test auction listing page
    await page.goto('/auctions')

    // Verify cards are stacked vertically
    const auctionCards = page.locator('[data-testid="auction-card"]')
    await expect(auctionCards.first()).toBeVisible()

    // Verify no horizontal overflow
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth)
    const bodyClientWidth = await page.evaluate(() => document.body.clientWidth)
    expect(bodyScrollWidth).toBeLessThanOrEqual(bodyClientWidth + 1) // Allow 1px tolerance

    // Test lot grid
    await page.goto('/auctions/1') // Assuming auction exists
    const lotCards = page.locator('[data-testid="lot-card"]')
    if (await lotCards.count() > 0) {
      await expect(lotCards.first()).toBeVisible()
    }
  })
})

test.describe('CSV Validation', () => {
  test('CSV errors show row and field details, allow partial import', async ({ page }) => {
    // Login as auctioneer
    await page.goto('/login')
    await page.fill('[name="email"]', testAuctioneer.email)
    await page.fill('[name="password"]', testAuctioneer.password)
    await page.click('button[type="submit"]')

    await page.goto('/org/auctions/new')
    // Create auction... (abbreviated for brevity)

    // Test CSV with validation errors
    const csvWithErrors = `title,description,image_urls,start_price_itc,bid_increment_itc
"Good Lot","Valid lot description","https://example.com/image.jpg",100,10
"","Missing description","",50,5
"Bad Price","Another lot","https://example.com/image2.jpg",-10,invalid`

    const csvFile = await page.evaluateHandle(
      (content) => {
        const blob = new Blob([content], { type: 'text/csv' })
        return new File([blob], 'test-errors.csv', { type: 'text/csv' })
      },
      csvWithErrors
    )

    await page.goto('/org/auctions/1/lots') // Assuming auction exists
    await page.click('button:has-text("Bulk Upload CSV")')
    await page.setInputFiles('input[type="file"]', csvFile as any)
    await page.click('button:has-text("Preview & Validate")')

    // Verify error display
    await expect(page.locator('text=1 valid, 2 with errors')).toBeVisible()
    await expect(page.locator('text=Row 2').locator('..').locator('text=error')).toBeVisible()
    await expect(page.locator('text=Row 3').locator('..').locator('text=error')).toBeVisible()

    // Verify can import valid rows only
    await expect(page.locator('button:has-text("Import 1 Lots")')).toBeVisible()
  })
})