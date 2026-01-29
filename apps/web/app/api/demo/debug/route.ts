import { NextResponse } from 'next/server'
import { DEMO } from '@/config/demo'

export async function GET() {
  return NextResponse.json({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
    DEMO_ENABLED: DEMO.ENABLED,
    demo_config: {
      NUM_AUCTIONEERS: DEMO.NUM_AUCTIONEERS,
      BOT_STRATEGIES: DEMO.BOT_STRATEGIES
    }
  })
}