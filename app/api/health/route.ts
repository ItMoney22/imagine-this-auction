import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // Basic health check - can be expanded to check database connectivity, etc.
    return NextResponse.json({
      ok: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      service: 'ImagineThisAuction'
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: 'unhealthy',
        error: 'Service unavailable',
        timestamp: new Date().toISOString()
      },
      { status: 503 }
    )
  }
}