'use client'

interface Batch {
  id?: string
  title?: string
  severity?: string
  sent_count?: number
  created_at?: string
  [key: string]: unknown
}

export function NotificationBatches({ batches }: { batches: Batch[] }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Batches</h2>
      {batches.length === 0 ? (
        <p className="text-gray-500">No batches found.</p>
      ) : (
        <div className="space-y-3">
          {batches.map((batch, i) => (
            <div key={batch.id || i} className="border border-gray-200 rounded p-3">
              <div className="flex justify-between items-center">
                <span className="font-medium text-sm">{batch.title || 'Notification batch'}</span>
                <span className={`text-xs px-2 py-1 rounded ${
                  batch.severity === 'warning' || batch.severity === 'urgent'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-green-100 text-green-700'
                }`}>
                  {batch.severity || 'info'}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Sent: {batch.sent_count ?? 0}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
