'use client'

interface Notification {
  id?: string
  type?: string
  title?: string
  message?: string
  status?: string
  created_at?: string
}

export function NotificationHistory({ notifications }: { notifications: Notification[] }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Notification History</h2>
      {notifications.length === 0 ? (
        <p className="text-gray-400 text-sm">No notifications yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {notifications.map((n, i) => (
            <li key={n.id || i} className="py-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-900">{n.title || n.type || 'Notification'}</p>
                  {n.message && <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>}
                </div>
                <div className="text-xs text-gray-400 ml-4 shrink-0">
                  {n.created_at ? new Date(n.created_at).toLocaleDateString() : ''}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
