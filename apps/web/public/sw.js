// Service Worker for PWA Push Notifications
// sw.js

const CACHE_NAME = 'imagine-this-auction-v1'
const NOTIFICATION_API = '/api/notifications/track'

// Install event
self.addEventListener('install', (event) => {
  console.log('Service Worker installing')
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/manifest.json',
        '/icon-192x192.png',
        '/icon-512x512.png',
        '/badge-72x72.png'
      ])
    })
  )
  self.skipWaiting()
})

// Activate event
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating')
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName)
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
  self.clients.claim()
})

// Push event handler
self.addEventListener('push', (event) => {
  console.log('Push received:', event)

  if (!event.data) {
    console.log('Push event but no data')
    return
  }

  const data = event.data.json()
  console.log('Push data:', data)

  const options = {
    body: data.body || 'New auction notification',
    icon: data.icon || '/icon-192x192.png',
    badge: data.badge || '/badge-72x72.png',
    image: data.image,
    tag: data.tag || `auction-${Date.now()}`,
    data: {
      url: data.url || '/',
      lot_id: data.lot_id,
      auction_id: data.auction_id,
      type: data.type || 'general',
      notification_id: data.notification_id,
      timestamp: Date.now()
    },
    actions: [
      {
        action: 'view',
        title: 'View Details',
        icon: '/icon-192x192.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: '/icon-192x192.png'
      }
    ],
    requireInteraction: data.requireInteraction || false,
    silent: data.silent || false,
    vibrate: data.vibrate || [200, 100, 200],
    timestamp: Date.now(),
    renotify: data.renotify || false
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'ImagineThis Auction', options)
      .then(() => {
        // Track notification display
        return trackNotificationEvent('displayed', {
          notification_id: data.notification_id,
          type: data.type
        })
      })
      .catch((error) => {
        console.error('Error showing notification:', error)
      })
  )
})

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event)

  const notification = event.notification
  const action = event.action
  const data = notification.data

  // Track click event
  trackNotificationEvent('clicked', {
    notification_id: data.notification_id,
    action: action || 'notification',
    type: data.type
  })

  notification.close()

  if (action === 'dismiss') {
    // Track dismiss
    trackNotificationEvent('dismissed', {
      notification_id: data.notification_id,
      type: data.type
    })
    return
  }

  // Handle view action or notification click
  const urlToOpen = action === 'view' ? data.url : data.url

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already a window/tab open with the target URL
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus()
          }
        }

        // If no existing window, open a new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen)
        }
      })
      .catch((error) => {
        console.error('Error handling notification click:', error)
      })
  )
})

// Notification close handler
self.addEventListener('notificationclose', (event) => {
  console.log('Notification closed:', event)

  const data = event.notification.data
  trackNotificationEvent('closed', {
    notification_id: data.notification_id,
    type: data.type
  })
})

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('Background sync:', event.tag)

  if (event.tag === 'notification-tracking') {
    event.waitUntil(syncNotificationTracking())
  }
})

// Helper function to track notification events
async function trackNotificationEvent(event, data) {
  try {
    const response = await fetch(NOTIFICATION_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        event,
        data,
        timestamp: Date.now(),
        user_agent: navigator.userAgent
      })
    })

    if (!response.ok) {
      throw new Error(`Tracking failed: ${response.statusText}`)
    }

    console.log(`Tracked notification event: ${event}`)
  } catch (error) {
    console.error('Failed to track notification event:', error)

    // Store for later sync if offline
    if (!navigator.onLine) {
      const trackingData = {
        event,
        data,
        timestamp: Date.now(),
        retry_count: 0
      }

      try {
        const cache = await caches.open('notification-tracking')
        await cache.put(
          new Request(`/tracking-${Date.now()}-${Math.random()}`),
          new Response(JSON.stringify(trackingData))
        )

        // Register for background sync
        self.registration.sync.register('notification-tracking')
      } catch (cacheError) {
        console.error('Failed to cache tracking data:', cacheError)
      }
    }
  }
}

// Sync offline tracking data
async function syncNotificationTracking() {
  try {
    const cache = await caches.open('notification-tracking')
    const requests = await cache.keys()

    for (const request of requests) {
      try {
        const response = await cache.match(request)
        const data = await response.json()

        // Retry tracking
        await trackNotificationEvent(data.event, data.data)

        // Remove from cache on success
        await cache.delete(request)
      } catch (error) {
        console.error('Failed to sync tracking data:', error)
      }
    }
  } catch (error) {
    console.error('Failed to sync notification tracking:', error)
  }
}

// Handle fetch events (basic caching strategy)
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return
  }

  // Skip non-HTTP requests
  if (!event.request.url.startsWith('http')) {
    return
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached version if available
      if (response) {
        return response
      }

      // Otherwise fetch from network
      return fetch(event.request).then((response) => {
        // Don't cache non-successful responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response
        }

        // Clone the response
        const responseToCache = response.clone()

        // Cache static assets
        if (event.request.url.includes('/static/') ||
            event.request.url.includes('.js') ||
            event.request.url.includes('.css') ||
            event.request.url.includes('.png') ||
            event.request.url.includes('.jpg') ||
            event.request.url.includes('.svg')) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache)
          })
        }

        return response
      })
    })
  )
})

// Handle message events from main thread
self.addEventListener('message', (event) => {
  console.log('Service Worker received message:', event.data)

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})