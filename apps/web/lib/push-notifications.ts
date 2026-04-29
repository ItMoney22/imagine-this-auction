// Push Notifications Client Library
// lib/push-notifications.ts

export interface PushSubscriptionConfig {
  vapidPublicKey: string
  serviceWorkerPath?: string
  scope?: string
}

export interface PushNotificationData {
  title: string
  body: string
  icon?: string
  badge?: string
  image?: string
  data?: any
  tag?: string
  requireInteraction?: boolean
  silent?: boolean
  vibrate?: number[]
}

export class PushNotificationManager {
  private config: PushSubscriptionConfig
  private registration: ServiceWorkerRegistration | null = null
  private subscription: PushSubscription | null = null

  constructor(config: PushSubscriptionConfig) {
    this.config = config
  }

  /**
   * Initialize push notifications
   */
  async initialize(): Promise<boolean> {
    try {
      // Check if service workers and push messaging are supported
      if (!('serviceWorker' in navigator)) {
        console.warn('Service Workers not supported')
        return false
      }

      if (!('PushManager' in window)) {
        console.warn('Push messaging not supported')
        return false
      }

      // Register service worker
      const registration = await navigator.serviceWorker.register(
        this.config.serviceWorkerPath || '/sw.js',
        { scope: this.config.scope || '/' }
      )

      console.log('Service Worker registered:', registration)

      // Wait for service worker to be ready
      await navigator.serviceWorker.ready
      this.registration = registration

      // Check for existing subscription
      this.subscription = await registration.pushManager.getSubscription()

      return true
    } catch (error) {
      console.error('Failed to initialize push notifications:', error)
      return false
    }
  }

  /**
   * Request notification permission
   */
  async requestPermission(): Promise<NotificationPermission> {
    try {
      const permission = await Notification.requestPermission()
      console.log('Notification permission:', permission)
      return permission
    } catch (error) {
      console.error('Failed to request notification permission:', error)
      return 'denied'
    }
  }

  /**
   * Subscribe to push notifications
   */
  async subscribe(userId: string): Promise<PushSubscription | null> {
    try {
      if (!this.registration) {
        throw new Error('Service worker not registered')
      }

      // Check permission
      const permission = await this.requestPermission()
      if (permission !== 'granted') {
        throw new Error('Notification permission denied')
      }

      // Subscribe to push manager
      const subscription = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(this.config.vapidPublicKey)
      })

      console.log('Push subscription created:', subscription)

      // Register subscription with server
      const response = await fetch('/api/notifications/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          user_id: userId,
          device_type: 'web',
          user_agent: navigator.userAgent
        })
      })

      if (!response.ok) {
        throw new Error(`Failed to register subscription: ${response.statusText}`)
      }

      this.subscription = subscription
      return subscription

    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error)
      return null
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribe(): Promise<boolean> {
    try {
      if (!this.subscription) {
        console.log('No active subscription to unsubscribe')
        return true
      }

      // Unsubscribe from push manager
      const result = await this.subscription.unsubscribe()

      if (result) {
        this.subscription = null
        console.log('Successfully unsubscribed from push notifications')
      }

      return result
    } catch (error) {
      console.error('Failed to unsubscribe from push notifications:', error)
      return false
    }
  }

  /**
   * Check if user is subscribed
   */
  async isSubscribed(): Promise<boolean> {
    try {
      if (!this.registration) {
        return false
      }

      const subscription = await this.registration.pushManager.getSubscription()
      this.subscription = subscription
      return !!subscription
    } catch (error) {
      console.error('Failed to check subscription status:', error)
      return false
    }
  }

  /**
   * Get current subscription
   */
  getSubscription(): PushSubscription | null {
    return this.subscription
  }

  /**
   * Get notification permission status
   */
  getPermissionStatus(): NotificationPermission {
    return Notification.permission
  }

  /**
   * Test notification (local)
   */
  async testNotification(data: PushNotificationData): Promise<void> {
    try {
      if (Notification.permission !== 'granted') {
        throw new Error('Notification permission not granted')
      }

      const notification = new Notification(data.title, {
        body: data.body,
        icon: data.icon || '/icon-192x192.png',
        badge: data.badge || '/badge-72x72.png',
        image: data.image,
        tag: data.tag || `test-${Date.now()}`,
        requireInteraction: data.requireInteraction || false,
        silent: data.silent || false,
        vibrate: data.vibrate || [200, 100, 200],
        data: data.data || {}
      })

      // Auto-close after 5 seconds
      setTimeout(() => {
        notification.close()
      }, 5000)

      console.log('Test notification shown')
    } catch (error) {
      console.error('Failed to show test notification:', error)
      throw error
    }
  }

  /**
   * Update service worker
   */
  async updateServiceWorker(): Promise<void> {
    try {
      if (!this.registration) {
        throw new Error('Service worker not registered')
      }

      // Check for updates
      await this.registration.update()

      // If there's a waiting service worker, activate it
      if (this.registration.waiting) {
        this.registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      }

      console.log('Service worker updated')
    } catch (error) {
      console.error('Failed to update service worker:', error)
      throw error
    }
  }

  /**
   * Add event listeners for service worker updates
   */
  onUpdateAvailable(callback: () => void): void {
    if (!this.registration) {
      console.warn('Service worker not registered')
      return
    }

    this.registration.addEventListener('updatefound', () => {
      const newWorker = this.registration!.installing

      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New service worker is available
            callback()
          }
        })
      }
    })
  }

  /**
   * Convert VAPID key to Uint8Array
   */
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/')

    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }

    return outputArray
  }
}

