'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface SuspiciousUser {
  user_id: string
  email: string
  risk_score: number
  flags: string[]
}

interface ComplianceFlag {
  id: string
  flag_type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  is_resolved: boolean
  created_at: string
  resolved_at: string | null
  resolution_notes: string | null
  metadata: any
  user: {
    id: string
    email: string
    first_name: string | null
    last_name: string | null
    role: string
  }
  flagged_by_user: {
    email: string
    first_name: string | null
    last_name: string | null
  } | null
  resolved_by_user: {
    email: string
    first_name: string | null
    last_name: string | null
  } | null
}

interface UserDocument {
  id: string
  document_type: string
  filename: string
  file_url: string
  file_size: number | null
  mime_type: string | null
  verification_status: 'pending' | 'approved' | 'rejected'
  verification_notes: string | null
  uploaded_at: string
  verified_at: string | null
  user: {
    id: string
    email: string
    first_name: string | null
    last_name: string | null
    role: string
  }
  verified_by_user: {
    email: string
    first_name: string | null
    last_name: string | null
  } | null
}

interface ComplianceSummary {
  suspicious_users_count: number
  high_risk_users: number
  unresolved_flags: number
  critical_flags: number
  pending_documents: number
}

export default function ComplianceManager() {
  const [activeSection, setActiveSection] = useState<'overview' | 'suspicious' | 'flags' | 'documents'>('overview')
  const [loading, setLoading] = useState(true)
  const [processingDocumentId, setProcessingDocumentId] = useState<string | null>(null)
  const [summary, setSummary] = useState<ComplianceSummary | null>(null)
  const [suspiciousUsers, setSuspiciousUsers] = useState<SuspiciousUser[]>([])
  const [complianceFlags, setComplianceFlags] = useState<ComplianceFlag[]>([])
  const [documents, setDocuments] = useState<UserDocument[]>([])

  useEffect(() => {
    fetchSummary()
  }, [])

  useEffect(() => {
    if (activeSection !== 'overview') {
      fetchSectionData()
    }
  }, [activeSection])

  const fetchSummary = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/compliance')
      if (!response.ok) throw new Error('Failed to fetch compliance summary')

      const data = await response.json()
      setSummary(data.summary)
    } catch (error) {
      console.error('Error fetching compliance summary:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchSectionData = async () => {
    try {
      setLoading(true)
      let endpoint = '/api/admin/compliance'

      switch (activeSection) {
        case 'suspicious':
          endpoint += '?action=suspicious-users'
          break
        case 'flags':
          endpoint += '?action=compliance-flags'
          break
        case 'documents':
          endpoint += '?action=kyc-documents'
          break
      }

      const response = await fetch(endpoint)
      if (!response.ok) throw new Error(`Failed to fetch ${activeSection} data`)

      const data = await response.json()

      switch (activeSection) {
        case 'suspicious':
          setSuspiciousUsers(data.suspicious_users || [])
          break
        case 'flags':
          setComplianceFlags(data.compliance_flags || [])
          break
        case 'documents':
          setDocuments(data.documents || [])
          break
      }
    } catch (error) {
      console.error(`Error fetching ${activeSection} data:`, error)
    } finally {
      setLoading(false)
    }
  }

  const formatUserName = (user: { first_name: string | null; last_name: string | null }) => {
    if (user.first_name || user.last_name) {
      return `${user.first_name || ''} ${user.last_name || ''}`.trim()
    }
    return 'No name'
  }

  const getRiskScoreColor = (score: number) => {
    if (score >= 30) return 'text-red-600'
    if (score >= 20) return 'text-orange-600'
    if (score >= 10) return 'text-yellow-600'
    return 'text-green-600'
  }

  const getSeverityBadgeVariant = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive'
      case 'high': return 'destructive'
      case 'medium': return 'secondary'
      case 'low': return 'outline'
      default: return 'outline'
    }
  }

  const getVerificationStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge variant="default">Approved</Badge>
      case 'rejected': return <Badge variant="destructive">Rejected</Badge>
      case 'pending': return <Badge variant="secondary">Pending Review</Badge>
      default: return <Badge variant="outline">Unknown</Badge>
    }
  }

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown'
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  const updateDocumentStatus = async (documentId: string, verificationStatus: 'approved' | 'rejected') => {
    try {
      setProcessingDocumentId(documentId)
      const response = await fetch('/api/admin/compliance/kyc-documents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: documentId,
          verification_status: verificationStatus,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to update document status')
      }

      await fetchSectionData()
    } catch (error) {
      console.error('Error updating document status:', error)
    } finally {
      setProcessingDocumentId(null)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading compliance data...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Compliance Management</CardTitle>
              <CardDescription>
                Fraud prevention, KYC management, and compliance oversight
              </CardDescription>
            </div>
            <Button onClick={fetchSummary} variant="outline">
              Refresh
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Section Navigation */}
      <Card>
        <CardContent className="pt-6">
          <nav className="flex space-x-1 rounded-lg bg-gray-200 p-1">
            {[
              { id: 'overview' as const, name: 'Overview' },
              { id: 'suspicious' as const, name: 'Suspicious Users' },
              { id: 'flags' as const, name: 'Compliance Flags' },
              { id: 'documents' as const, name: 'KYC Documents' },
            ].map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`
                  flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors
                  ${
                    activeSection === section.id
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }
                `}
              >
                {section.name}
              </button>
            ))}
          </nav>
        </CardContent>
      </Card>

      {/* Overview */}
      {activeSection === 'overview' && summary && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-orange-600">
                {summary.suspicious_users_count}
              </CardTitle>
              <CardDescription>Suspicious Users</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                High Risk: {summary.high_risk_users}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-red-600">
                {summary.unresolved_flags}
              </CardTitle>
              <CardDescription>Unresolved Flags</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Critical: {summary.critical_flags}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-blue-600">
                {summary.pending_documents}
              </CardTitle>
              <CardDescription>Pending Documents</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Awaiting review
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg text-green-600">
                {summary.suspicious_users_count - summary.high_risk_users}
              </CardTitle>
              <CardDescription>Low Risk Users</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Minor flags only
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">
                {summary.unresolved_flags - summary.critical_flags}
              </CardTitle>
              <CardDescription>Non-Critical Flags</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Lower priority
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Suspicious Users */}
      {activeSection === 'suspicious' && (
        <Card>
          <CardHeader>
            <CardTitle>Suspicious Users</CardTitle>
            <CardDescription>
              Users flagged by automated risk detection
            </CardDescription>
          </CardHeader>
          <CardContent>
            {suspiciousUsers.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-gray-600">No suspicious users detected</p>
              </div>
            ) : (
              <div className="space-y-4">
                {suspiciousUsers.map((user) => (
                  <div key={user.user_id} className="flex items-center justify-between border-b pb-4">
                    <div>
                      <p className="font-medium">{user.email}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {user.flags.map((flag, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {flag.replace('_', ' ')}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${getRiskScoreColor(user.risk_score)}`}>
                        {user.risk_score}
                      </p>
                      <p className="text-sm text-gray-600">Risk Score</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Compliance Flags */}
      {activeSection === 'flags' && (
        <Card>
          <CardHeader>
            <CardTitle>Compliance Flags</CardTitle>
            <CardDescription>
              Manual and automated compliance flags
            </CardDescription>
          </CardHeader>
          <CardContent>
            {complianceFlags.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-gray-600">No compliance flags found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {complianceFlags.map((flag) => (
                  <div key={flag.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <Badge variant={getSeverityBadgeVariant(flag.severity)}>
                            {flag.severity.toUpperCase()}
                          </Badge>
                          <Badge variant="outline">
                            {flag.flag_type.replace('_', ' ')}
                          </Badge>
                          {flag.is_resolved && (
                            <Badge variant="default">Resolved</Badge>
                          )}
                        </div>
                        <h3 className="font-medium">{formatUserName(flag.user)} ({flag.user.email})</h3>
                        <p className="text-sm text-gray-600 mt-1">{flag.description}</p>
                        {flag.flagged_by_user && (
                          <p className="text-xs text-gray-500 mt-1">
                            Flagged by: {formatUserName(flag.flagged_by_user)}
                          </p>
                        )}
                        {flag.is_resolved && flag.resolved_by_user && (
                          <div className="mt-2 text-sm">
                            <p className="text-gray-600">
                              <strong>Resolution:</strong> {flag.resolution_notes || 'No notes provided'}
                            </p>
                            <p className="text-xs text-gray-500">
                              Resolved by: {formatUserName(flag.resolved_by_user)} on{' '}
                              {flag.resolved_at ? new Date(flag.resolved_at).toLocaleDateString() : 'Unknown'}
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">
                          {new Date(flag.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* KYC Documents */}
      {activeSection === 'documents' && (
        <Card>
          <CardHeader>
            <CardTitle>KYC Documents</CardTitle>
            <CardDescription>
              User-uploaded documents for verification
            </CardDescription>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-gray-600">No documents found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between border-b pb-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        {getVerificationStatusBadge(doc.verification_status)}
                        <Badge variant="outline">
                          {doc.document_type.replace('_', ' ')}
                        </Badge>
                      </div>
                      <p className="font-medium">{formatUserName(doc.user)} ({doc.user.email})</p>
                      <p className="text-sm text-gray-600">{doc.filename}</p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(doc.file_size)} • {doc.mime_type} •
                        Uploaded: {new Date(doc.uploaded_at).toLocaleDateString()}
                      </p>
                      {doc.verification_notes && (
                        <p className="text-sm text-gray-600 mt-1">
                          <strong>Notes:</strong> {doc.verification_notes}
                        </p>
                      )}
                      {doc.verified_by_user && doc.verified_at && (
                        <p className="text-xs text-gray-500">
                          Verified by: {formatUserName(doc.verified_by_user)} on{' '}
                          {new Date(doc.verified_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col space-y-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(doc.file_url, '_blank')}
                      >
                        View Document
                      </Button>
                      {doc.verification_status === 'pending' && (
                        <div className="flex space-x-1">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            disabled={processingDocumentId === doc.id}
                            onClick={() => updateDocumentStatus(doc.id, 'approved')}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={processingDocumentId === doc.id}
                            onClick={() => updateDocumentStatus(doc.id, 'rejected')}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
