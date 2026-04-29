'use client'

interface DeviceToken {
  id?: string
  endpoint?: string
  last_used?: string
  created_at?: string
}

interface Props {
  userId: string
  deviceTokens: DeviceToken[]
}

export function PushNotificationSettings({ deviceTokens }: Props) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Push Notifications</h2>
      <p className="text-sm text-gray-500 mb-4">Manage devices that receive push notifications.</p>
      {deviceTokens.length === 0 ? (
        <p className="text-gray-400 text-sm">No devices registered for push notifications.</p>
      ) : (
        <ul className="space-y-2">
          {deviceTokens.map((token, i) => (
            <li key={token.id || i} className="flex items-center justify-between border border-gray-200 rounded p-3">
              <span className="text-sm text-gray-700">
                {token.endpoint ? new URL(token.endpoint).hostname : 'Unknown device'}
              </span>
              <span className="text-xs text-gray-400">
                {token.last_used
                  ? `Last used ${new Date(token.last_used).toLocaleDateString()}`
                  : token.created_at
                  ? new Date(token.created_at).toLocaleDateString()
                  : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
