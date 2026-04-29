'use client'

interface BatchStat {
  id?: string
  title?: string
  severity?: string
  sent_count?: number
  created_at?: string
}

interface FeatureFlag {
  flag_name?: string
  is_enabled?: boolean
  [key: string]: unknown
}

interface Props {
  batchStats: BatchStat[]
  pendingNotifications: number
  featureFlags: FeatureFlag[]
}

export function NotificationStats({ batchStats, pendingNotifications, featureFlags }: Props) {
  const totalSent = batchStats.reduce((sum, b) => sum + (b.sent_count ?? 0), 0)
  const urgentBatches = batchStats.filter((batch) => batch.severity === 'urgent').length

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
      <div className="bg-white rounded-lg shadow p-5">
        <div className="text-sm text-gray-500">Total Sent</div>
        <div className="text-3xl font-bold text-gray-900">{totalSent}</div>
      </div>
      <div className="bg-white rounded-lg shadow p-5">
        <div className="text-sm text-gray-500">Pending</div>
        <div className="text-3xl font-bold text-yellow-600">{pendingNotifications}</div>
      </div>
      <div className="bg-white rounded-lg shadow p-5">
        <div className="text-sm text-gray-500">Urgent Batches</div>
        <div className="text-3xl font-bold text-red-600">{urgentBatches}</div>
      </div>
      {featureFlags.length > 0 && (
        <div className="bg-white rounded-lg shadow p-5 col-span-full">
          <div className="text-sm font-medium text-gray-700 mb-2">Feature Flags</div>
          <div className="flex flex-wrap gap-2">
            {featureFlags.map((flag, i) => (
              <span key={i} className={`text-xs px-2 py-1 rounded ${flag.is_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {flag.flag_name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
