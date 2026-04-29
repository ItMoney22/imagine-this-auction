'use client'

import { useState } from 'react'
import { Building2, FileCheck2, Loader2, Send } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface AuctioneerApplicationFormProps {
  initialEmail: string
  existingApplication?: {
    companyName: string
    isApproved: boolean
    businessLicense: string | null
    createdAt: string
    licenseDocumentStatus: string | null
  } | null
}

export function AuctioneerApplicationForm({
  initialEmail,
  existingApplication,
}: AuctioneerApplicationFormProps) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setMessage(null)

    const form = event.currentTarget
    const formData = new FormData(form)

    try {
      const response = await fetch('/api/auctioneer/apply', {
        method: 'POST',
        body: formData,
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit application')
      }

      setMessage('Application submitted. We will review your license before marketplace access is approved.')
      form.reset()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to submit application')
    } finally {
      setSubmitting(false)
    }
  }

  if (existingApplication) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
            <FileCheck2 className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className="text-xl">{existingApplication.companyName}</CardTitle>
            <p className="text-sm text-slate-500">
              Submitted {new Date(existingApplication.createdAt).toLocaleDateString()}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 text-sm text-slate-700">
            <p className="font-semibold text-slate-950">
              {existingApplication.isApproved ? 'Approved' : 'Pending admin verification'}
            </p>
            <p className="mt-1">
              License document status: {existingApplication.licenseDocumentStatus || 'pending'}
            </p>
            {existingApplication.businessLicense ? (
              <p className="mt-1">License number: {existingApplication.businessLicense}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4c1d95] to-[#daa520] text-white">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className="text-2xl">Auctioneer Application</CardTitle>
            <p className="text-sm text-slate-500">Upload your business license for admin verification.</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input id="companyName" name="companyName" required placeholder="Acme Estate Auctions" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessLicense">License Number</Label>
              <Input id="businessLicense" name="businessLicense" required placeholder="State license or permit ID" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contactEmail">Contact Email</Label>
              <Input id="contactEmail" name="contactEmail" type="email" defaultValue={initialEmail} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" name="phone" type="tel" placeholder="(555) 123-4567" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="addressLine1">Address Line 1</Label>
              <Input id="addressLine1" name="addressLine1" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addressLine2">Address Line 2</Label>
              <Input id="addressLine2" name="addressLine2" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input id="state" name="state" required maxLength={32} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zipCode">ZIP Code</Label>
              <Input id="zipCode" name="zipCode" required />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input id="website" name="website" type="url" placeholder="https://example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="licenseFile">Business License Upload</Label>
              <Input
                id="licenseFile"
                name="licenseFile"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                required
              />
              <p className="text-xs text-slate-500">PDF, JPG, PNG, or WebP. Max 10 MB.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes for Review</Label>
            <Textarea id="notes" name="notes" placeholder="Anything we should know while verifying your license?" />
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : null}
          {message ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              {message}
            </div>
          ) : null}

          <Button type="submit" disabled={submitting} className="w-full justify-center">
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {submitting ? 'Submitting...' : 'Submit for Verification'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
