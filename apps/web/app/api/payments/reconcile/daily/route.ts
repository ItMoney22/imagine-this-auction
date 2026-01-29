import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      status: 'pending',
      message: 'PaymentCloud daily reconciliation is pending merchant onboarding. Configure API credentials to enable automatic settlement.',
    },
    { status: 202 }
  )
}
