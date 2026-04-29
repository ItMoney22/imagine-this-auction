import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const LICENSE_BUCKET = 'auctioneer-licenses'
const MAX_LICENSE_BYTES = 10 * 1024 * 1024
const ALLOWED_LICENSE_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
])

function stringValue(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-')
}

function optionalUrl(value: string) {
  if (!value) {
    return null
  }

  try {
    return new URL(value).toString()
  } catch {
    throw new Error('Website must be a valid URL')
  }
}

export async function POST(request: NextRequest) {
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

    const formData = await request.formData()
    const companyName = stringValue(formData, 'companyName')
    const businessLicense = stringValue(formData, 'businessLicense')
    const contactEmail = stringValue(formData, 'contactEmail') || user.email || ''
    const phone = stringValue(formData, 'phone')
    const addressLine1 = stringValue(formData, 'addressLine1')
    const addressLine2 = stringValue(formData, 'addressLine2')
    const city = stringValue(formData, 'city')
    const state = stringValue(formData, 'state')
    const zipCode = stringValue(formData, 'zipCode')
    const website = optionalUrl(stringValue(formData, 'website'))
    const notes = stringValue(formData, 'notes')
    const licenseFile = formData.get('licenseFile')

    if (!companyName || !businessLicense || !contactEmail || !addressLine1 || !city || !state || !zipCode) {
      return NextResponse.json({ error: 'Missing required application fields' }, { status: 400 })
    }

    if (!(licenseFile instanceof File) || licenseFile.size === 0) {
      return NextResponse.json({ error: 'Business license upload is required' }, { status: 400 })
    }

    if (licenseFile.size > MAX_LICENSE_BYTES) {
      return NextResponse.json({ error: 'Business license file must be 10 MB or smaller' }, { status: 400 })
    }

    if (!ALLOWED_LICENSE_TYPES.has(licenseFile.type)) {
      return NextResponse.json(
        { error: 'Business license must be a PDF, JPG, PNG, or WebP file' },
        { status: 400 },
      )
    }

    const { data: existingAuctioneer } = await admin
      .from('auctioneers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingAuctioneer) {
      return NextResponse.json({ error: 'You already have an auctioneer application on file' }, { status: 409 })
    }

    await admin.storage.createBucket(LICENSE_BUCKET, {
      public: false,
      fileSizeLimit: MAX_LICENSE_BYTES,
      allowedMimeTypes: Array.from(ALLOWED_LICENSE_TYPES),
    }).catch(() => null)

    const filePath = [
      user.id,
      `${Date.now()}-${crypto.randomUUID()}-${sanitizeFilename(licenseFile.name)}`,
    ].join('/')

    const { error: uploadError } = await admin.storage
      .from(LICENSE_BUCKET)
      .upload(filePath, licenseFile, {
        cacheControl: '3600',
        contentType: licenseFile.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Failed to upload auctioneer license:', uploadError)
      return NextResponse.json({ error: 'Failed to upload license document' }, { status: 500 })
    }

    const now = new Date().toISOString()

    const { error: userError } = await admin
      .from('users')
      .upsert({
        id: user.id,
        email: contactEmail,
        role: 'auctioneer',
        phone: phone || null,
        is_approved: false,
        updated_at: now,
      }, { onConflict: 'id' })

    if (userError) {
      console.error('Failed to update user for auctioneer application:', userError)
      return NextResponse.json({ error: 'Failed to update user profile' }, { status: 500 })
    }

    const { error: auctioneerError } = await admin
      .from('auctioneers')
      .insert({
        user_id: user.id,
        company_name: companyName,
        business_license: businessLicense,
        address_line1: addressLine1,
        address_line2: addressLine2 || null,
        city,
        state,
        zip_code: zipCode,
        website,
        is_approved: false,
      })

    if (auctioneerError) {
      console.error('Failed to create auctioneer application:', auctioneerError)
      return NextResponse.json({ error: 'Failed to create auctioneer application' }, { status: 500 })
    }

    const { error: documentError } = await admin
      .from('user_documents')
      .insert({
        user_id: user.id,
        document_type: 'auctioneer_license',
        filename: licenseFile.name,
        file_url: `${LICENSE_BUCKET}/${filePath}`,
        file_size: licenseFile.size,
        mime_type: licenseFile.type,
        verification_status: 'pending',
        verification_notes: notes || null,
      })

    if (documentError) {
      console.error('Failed to record auctioneer license document:', documentError)
      return NextResponse.json({ error: 'Failed to record license document' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Auctioneer application API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
