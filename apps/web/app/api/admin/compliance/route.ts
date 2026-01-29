import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    // TEMPORARY: Skip auth for development
    // Check authentication and admin role
    // const {
    //   data: { user },
    //   error: authError,
    // } = await supabase.auth.getUser()

    // if (authError || !user) {
    //   return NextResponse.json(
    //     { error: 'Authentication required' },
    //     { status: 401 }
    //   )
    // }

    // const { data: userData, error: userError } = await supabase
    //   .from('users')
    //   .select('role')
    //   .eq('id', user.id)
    //   .single()

    // if (userError || !userData || userData.role !== 'admin') {
    //   return NextResponse.json(
    //     { error: 'Admin access required' },
    //     { status: 403 }
    //   )
    // }

    const action = searchParams.get('action')

    if (action === 'suspicious-users') {
      // Get suspicious users using the detection function
      const { data: suspiciousUsers, error: suspiciousError } = await supabase
        .rpc('detect_suspicious_users')

      if (suspiciousError) {
        console.error('Failed to detect suspicious users:', suspiciousError)
        return NextResponse.json(
          { error: 'Failed to detect suspicious users' },
          { status: 500 }
        )
      }

      return NextResponse.json({ suspicious_users: suspiciousUsers })

    } else if (action === 'compliance-flags') {
      // Get all compliance flags
      const { data: flags, error: flagsError } = await supabase
        .from('user_compliance_flags')
        .select(`
          id,
          flag_type,
          severity,
          description,
          is_resolved,
          created_at,
          resolved_at,
          resolution_notes,
          metadata,
          user:users!user_id(
            id,
            email,
            first_name,
            last_name,
            role
          ),
          flagged_by_user:users!flagged_by(
            email,
            first_name,
            last_name
          ),
          resolved_by_user:users!resolved_by(
            email,
            first_name,
            last_name
          )
        `)
        .order('created_at', { ascending: false })

      if (flagsError) {
        console.error('Failed to fetch compliance flags:', flagsError)
        return NextResponse.json(
          { error: 'Failed to fetch compliance flags' },
          { status: 500 }
        )
      }

      return NextResponse.json({ compliance_flags: flags })

    } else if (action === 'kyc-documents') {
      // Get pending document verifications
      const { data: documents, error: docsError } = await supabase
        .from('user_documents')
        .select(`
          id,
          document_type,
          filename,
          file_url,
          file_size,
          mime_type,
          verification_status,
          verification_notes,
          uploaded_at,
          verified_at,
          user:users!user_id(
            id,
            email,
            first_name,
            last_name,
            role
          ),
          verified_by_user:users!verified_by(
            email,
            first_name,
            last_name
          )
        `)
        .order('uploaded_at', { ascending: false })

      if (docsError) {
        console.error('Failed to fetch documents:', docsError)
        return NextResponse.json(
          { error: 'Failed to fetch documents' },
          { status: 500 }
        )
      }

      return NextResponse.json({ documents })

    } else {
      // Default: return summary of all compliance data
      const [suspiciousResult, flagsResult, docsResult] = await Promise.all([
        supabase.rpc('detect_suspicious_users'),
        supabase
          .from('user_compliance_flags')
          .select('severity, is_resolved')
          .eq('is_resolved', false),
        supabase
          .from('user_documents')
          .select('verification_status')
          .eq('verification_status', 'pending')
      ])

      const summary = {
        suspicious_users_count: suspiciousResult.data?.length || 0,
        high_risk_users: suspiciousResult.data?.filter(u => u.risk_score >= 25).length || 0,
        unresolved_flags: flagsResult.data?.length || 0,
        critical_flags: flagsResult.data?.filter(f => f.severity === 'critical').length || 0,
        pending_documents: docsResult.data?.length || 0,
      }

      return NextResponse.json({ summary })
    }

  } catch (error) {
    console.error('Admin compliance API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}