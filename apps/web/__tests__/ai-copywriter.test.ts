/**
 * @jest-environment node
 */

import { POST, GET } from '@/app/api/ai/copywriter/route'
import { NextRequest } from 'next/server'

// Mock environment variables
process.env.COPYWRITER_PROVIDER = 'openai'
process.env.OPENAI_API_KEY = 'test-key'

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({
            data: { enabled: true }
          })
        }))
      })),
      update: jest.fn(() => ({
        eq: jest.fn().mockResolvedValue({ error: null })
      })),
      upsert: jest.fn().mockResolvedValue({ error: null })
    }))
  }))
}))

// Mock OpenAI
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{
            message: {
              content: JSON.stringify({
                headline: "Amazing Auction Item - Don't Miss Out!",
                teaser: "This incredible piece combines craftsmanship with investment potential.",
                cta: "Bid Now",
                email_subject: "New Auction Alert: Amazing Item",
                push_title: "Hot Auction Item",
                push_body: "Amazing piece just listed!"
              })
            }
          }]
        })
      }
    }
  }))
})

describe('/api/ai/copywriter', () => {
  describe('POST', () => {
    it('should generate hype copy for valid lots', async () => {
      const request = new NextRequest('http://localhost:3000/api/ai/copywriter', {
        method: 'POST',
        body: JSON.stringify({
          lots: [{
            id: '123e4567-e89b-12d3-a456-426614174000',
            title: 'Vintage Watch',
            description: 'A rare vintage timepiece from the 1950s',
            category: 'Watches',
            brand: 'Rolex',
            start_price_itc: 1000
          }],
          style: 'Hype'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.processed).toBe(1)
      expect(data.successful).toBe(1)
      expect(data.failed).toBe(0)
      expect(data.results).toHaveLength(1)
      expect(data.results[0].hype_copy).toMatchObject({
        headline: expect.any(String),
        teaser: expect.any(String),
        cta: expect.any(String),
        email_subject: expect.any(String),
        push_title: expect.any(String),
        push_body: expect.any(String)
      })
    })

    it('should validate request data', async () => {
      const request = new NextRequest('http://localhost:3000/api/ai/copywriter', {
        method: 'POST',
        body: JSON.stringify({
          lots: [], // Empty lots array
          style: 'InvalidStyle' // Invalid style
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request data')
    })

    it('should handle AI generation failures gracefully', async () => {
      // Mock OpenAI to throw an error
      const OpenAI = require('openai')
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockRejectedValue(new Error('API rate limit exceeded'))
          }
        }
      }))

      const request = new NextRequest('http://localhost:3000/api/ai/copywriter', {
        method: 'POST',
        body: JSON.stringify({
          lots: [{
            id: '123e4567-e89b-12d3-a456-426614174000',
            title: 'Test Item',
            description: 'Test description'
          }],
          style: 'Classic'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.results[0].hype_copy.style).toBe('Fallback')
    })

    it('should sanitize toxic content', async () => {
      // Mock OpenAI to return toxic content
      const OpenAI = require('openai')
      OpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: JSON.stringify({
                    headline: "Buy now guaranteed profit no risk!",
                    teaser: "Secret miracle investment opportunity",
                    cta: "Buy Now",
                    email_subject: "Guaranteed Profit Alert",
                    push_title: "Secret Deal",
                    push_body: "Miracle opportunity!"
                  })
                }
              }]
            })
          }
        }
      }))

      const request = new NextRequest('http://localhost:3000/api/ai/copywriter', {
        method: 'POST',
        body: JSON.stringify({
          lots: [{
            id: '123e4567-e89b-12d3-a456-426614174000',
            title: 'Test Item',
            description: 'Test description'
          }],
          style: 'Hype'
        })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.results[0].hype_copy.style).toBe('Safe')
      expect(data.results[0].hype_copy.toxicity_score).toBeGreaterThan(0.5)
    })
  })

  describe('GET', () => {
    it('should return health check information', async () => {
      const request = new NextRequest('http://localhost:3000/api/ai/copywriter')
      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.status).toBe('healthy')
      expect(data.provider).toBe('openai')
      expect(data.api_key_configured).toBe(true)
      expect(data.features).toMatchObject({
        toxicity_detection: true,
        batch_processing: true
      })
    })
  })
})

describe('Content Validation', () => {
  it('should detect unsafe patterns', () => {
    const { checkToxicity } = require('@/app/api/ai/copywriter/route')

    const safeContent = "Beautiful vintage watch from a renowned maker"
    const unsafeContent = "Buy now guaranteed profit no risk contact me personally"

    expect(checkToxicity(safeContent)).toBe(0)
    expect(checkToxicity(unsafeContent)).toBeGreaterThan(0.5)
  })

  it('should validate hype copy schema', () => {
    const { HypeCopySchema } = require('@/app/api/ai/copywriter/route')

    const validCopy = {
      headline: "Great Auction Item",
      teaser: "A wonderful piece for your collection",
      cta: "Bid Now",
      email_subject: "Auction Alert",
      push_title: "New Item",
      push_body: "Check out this new auction item",
      style: "Hype",
      generated_at: new Date().toISOString()
    }

    const invalidCopy = {
      headline: "", // Too short
      teaser: "x".repeat(201), // Too long
      // Missing required fields
    }

    expect(() => HypeCopySchema.parse(validCopy)).not.toThrow()
    expect(() => HypeCopySchema.parse(invalidCopy)).toThrow()
  })
})