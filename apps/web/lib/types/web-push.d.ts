// Minimal declaration for the untyped `web-push` package
// (@types/web-push is not installed).
declare module 'web-push' {
  export interface PushSubscriptionLike {
    endpoint: string
    keys: { p256dh: string; auth: string }
  }
  export function setVapidDetails(subject: string, publicKey: string, privateKey: string): void
  export function sendNotification(
    subscription: PushSubscriptionLike,
    payload?: string,
    options?: Record<string, unknown>
  ): Promise<{ statusCode: number; body: string }>
  const webpush: {
    setVapidDetails: typeof setVapidDetails
    sendNotification: typeof sendNotification
  }
  export default webpush
}
