'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Auction, Lot } from '@/lib/types/database'
import { Upload, X, Check, AlertTriangle, Download } from 'lucide-react'

interface CsvUploadProps {
  auction: Auction
  onImport: (lots: Lot[]) => void
  onCancel: () => void
}

interface CsvRow {
  title: string
  description: string
  image_urls: string
  starting_bid: string
  increment: string
  reserve_price?: string
  category?: string
}

interface ValidationError {
  row: number
  field: string
  message: string
}

interface ParsedLot extends CsvRow {
  rowIndex: number
  isValid: boolean
  errors: ValidationError[]
}

export function CsvUpload({ auction, onImport, onCancel }: CsvUploadProps) {
  const supabase = createClient()
  const [file, setFile] = useState<File | null>(null)
  const [parsedLots, setParsedLots] = useState<ParsedLot[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'upload' | 'preview' | 'importing'>('upload')

  const validateRow = (row: CsvRow, index: number): ValidationError[] => {
    const errors: ValidationError[] = []

    if (!row.title?.trim()) {
      errors.push({ row: index, field: 'title', message: 'Title is required' })
    }

    if (!row.description?.trim()) {
      errors.push({ row: index, field: 'description', message: 'Description is required' })
    }

    const startPrice = parseInt(row.starting_bid)
    if (!startPrice || startPrice < 1) {
      errors.push({ row: index, field: 'starting_bid', message: 'Start price must be a positive number' })
    }

    const bidIncrement = parseInt(row.increment)
    if (!bidIncrement || bidIncrement < 1) {
      errors.push({ row: index, field: 'increment', message: 'Bid increment must be a positive number' })
    }

    if (row.reserve_price) {
      const reservePrice = parseInt(row.reserve_price)
      if (!reservePrice || reservePrice < 1) {
        errors.push({ row: index, field: 'reserve_price', message: 'Reserve price must be a positive number' })
      }
    }

    return errors
  }

  const parseCSV = (content: string): ParsedLot[] => {
    const lines = content.split('\n').filter(line => line.trim())
    if (lines.length < 2) {
      throw new Error('CSV must have at least a header row and one data row')
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
    const requiredHeaders = ['title', 'description', 'image_urls', 'starting_bid', 'increment']

    for (const required of requiredHeaders) {
      if (!headers.includes(required)) {
        throw new Error(`Missing required column: ${required}`)
      }
    }

    const parsedLots: ParsedLot[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''))
      const row: any = {}

      headers.forEach((header, index) => {
        row[header] = values[index] || ''
      })

      const errors = validateRow(row, i)
      parsedLots.push({
        ...row,
        rowIndex: i,
        isValid: errors.length === 0,
        errors
      })
    }

    return parsedLots
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile)
      setError(null)
    } else {
      setError('Please select a valid CSV file')
    }
  }

  const handlePreview = async () => {
    if (!file) return

    setLoading(true)
    setError(null)

    try {
      const content = await file.text()
      const parsed = parseCSV(content)
      setParsedLots(parsed)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSV')
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    setStep('importing')
    setLoading(true)
    setError(null)

    try {
      const validLots = parsedLots.filter(lot => lot.isValid)

      if (validLots.length === 0) {
        throw new Error('No valid lots to import')
      }

      // Get starting lot number
      const { data: existingLots } = await supabase
        .from('lots')
        .select('lot_number')
        .eq('auction_id', auction.id)
        .order('lot_number', { ascending: false })
        .limit(1)

      let nextLotNumber = existingLots?.[0]?.lot_number ? existingLots[0].lot_number + 1 : 1

      const lotsToInsert = validLots.map((lot) => ({
        auction_id: auction.id,
        lot_number: nextLotNumber++,
        title: lot.title,
        description: lot.description,
        images: lot.image_urls ? lot.image_urls.split(',').map(url => url.trim()) : [],
        starting_bid: parseInt(lot.starting_bid),
        increment: parseInt(lot.increment),
        reserve_price: lot.reserve_price ? parseInt(lot.reserve_price) : null,
        category: lot.category || null,
        status: 'draft' as const,
      }))

      const { data: insertedLots, error: insertError } = await supabase
        .from('lots')
        .insert(lotsToInsert)
        .select()

      if (insertError) throw insertError

      // Save CSV for audit
      const { error: storageError } = await supabase.storage
        .from('audit-files')
        .upload(
          `csv-imports/${auction.id}/${Date.now()}-${file.name}`,
          file,
          { upsert: false }
        )

      if (storageError) {
        console.warn('Failed to save CSV for audit:', storageError)
      }

      onImport(insertedLots)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import lots')
    } finally {
      setLoading(false)
    }
  }

  const downloadSample = () => {
    const sampleCsv = `title,description,image_urls,starting_bid,increment,reserve_price,category
"Antique Oak Table","Beautiful solid oak dining table from 1920s","https://example.com/table1.jpg,https://example.com/table2.jpg",100,10,150,"Furniture"
"Vintage Pocket Watch","Gold plated pocket watch in working condition","https://example.com/watch.jpg",50,5,,"Collectibles"
"Oil Painting Landscape","Original oil painting 24x18 inches","https://example.com/painting.jpg",200,25,300,"Art"`

    const blob = new Blob([sampleCsv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'lots-sample.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (step === 'upload') {
    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="csv-file">Select CSV File</Label>
          <Input
            id="csv-file"
            type="file"
            accept=".csv"
            onChange={handleFileChange}
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2">CSV Format Requirements</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• <strong>title</strong>: Lot title (required)</li>
            <li>• <strong>description</strong>: Lot description (required)</li>
            <li>• <strong>image_urls</strong>: Comma-separated image URLs</li>
            <li>• <strong>starting_bid</strong>: Starting price in cents (required)</li>
            <li>• <strong>increment</strong>: Bid increment in cents (required)</li>
            <li>• <strong>reserve_price</strong>: Reserve price in cents (optional)</li>
            <li>• <strong>category</strong>: Category name (optional)</li>
          </ul>
        </div>

        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={downloadSample}>
            <Download className="h-4 w-4 mr-2" />
            Download Sample CSV
          </Button>

          <div className="flex space-x-3">
            <Button type="button" variant="outline" onClick={onCancel}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handlePreview} disabled={!file || loading}>
              <Upload className="h-4 w-4 mr-2" />
              {loading ? 'Processing...' : 'Preview & Validate'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'preview') {
    const validCount = parsedLots.filter(lot => lot.isValid).length
    const errorCount = parsedLots.length - validCount

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Import Preview</h4>
          <div className="text-sm text-gray-600">
            {validCount} valid, {errorCount} with errors
          </div>
        </div>

        {errorCount > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              {errorCount} rows have validation errors and will be skipped.
            </p>
          </div>
        )}

        <div className="max-h-64 overflow-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">Row</th>
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-left">Start Price</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {parsedLots.map((lot) => (
                <tr key={lot.rowIndex} className={lot.isValid ? 'bg-green-50' : 'bg-red-50'}>
                  <td className="px-3 py-2">{lot.rowIndex}</td>
                  <td className="px-3 py-2 truncate max-w-32">{lot.title}</td>
                  <td className="px-3 py-2">{lot.starting_bid}</td>
                  <td className="px-3 py-2">
                    {lot.isValid ? (
                      <div className="flex items-center text-green-600">
                        <Check className="h-4 w-4 mr-1" />
                        Valid
                      </div>
                    ) : (
                      <div className="flex items-center text-red-600">
                        <AlertTriangle className="h-4 w-4 mr-1" />
                        {lot.errors.length} error(s)
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end space-x-3">
          <Button type="button" variant="outline" onClick={() => setStep('upload')}>
            Back
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={validCount === 0 || loading}
          >
            <Upload className="h-4 w-4 mr-2" />
            Import {validCount} Lots
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'importing') {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Importing lots...</p>
      </div>
    )
  }

  return null
}