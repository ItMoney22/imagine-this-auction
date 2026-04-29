import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const LICENSE_BUCKET = 'auctioneer-licenses'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { data: adminUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!adminUser || adminUser.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { data: auctioneer, error: auctioneerError } = await admin
      .from('auctioneers')
      .select('user_id')
      .eq('id', id)
      .single()

    if (auctioneerError || !auctioneer) {
      return NextResponse.json({ error: 'Auctioneer application not found' }, { status: 404 })
    }

    const { data: document, error: documentError } = await admin
      .from('user_documents')
      .select('file_url')
      .eq('user_id', auctioneer.user_id)
      .eq('document_type', 'auctioneer_license')
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (documentError || !document) {
      return NextResponse.json({ error: 'License document not found' }, { status: 404 })
    }

    const path = document.file_url.startsWith(`${LICENSE_BUCKET}/`)
      ? document.file_url.slice(`${LICENSE_BUCKET}/`.length)
      : document.file_url

    const { data: signedUrl, error: signedUrlError } = await admin.storage
      .from(LICENSE_BUCKET)
      .createSignedUrl(path, 300)

    if (signedUrlError || !signedUrl) {
      console.error('Failed to create signed license URL:', signedUrlError)
      return NextResponse.json({ error: 'Failed to open license document' }, { status: 500 })
    }

    return NextResponse.json({ url: signedUrl.signedUrl })
  } catch (error) {
    console.error('License document API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
