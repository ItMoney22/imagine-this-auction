import { useState, useCallback } from 'react'

export interface Toast {
  id: string
  title: string
  description?: string
  variant?: 'default' | 'destructive'
  duration?: number
}

const toasts: Toast[] = []
const listeners: Set<(toasts: Toast[]) => void> = new Set()

let toastCount = 0

function addToast(toast: Omit<Toast, 'id'>) {
  const id = (++toastCount).toString()
  const toastWithId = { ...toast, id }

  toasts.push(toastWithId)
  listeners.forEach(listener => listener([...toasts]))

  // Auto remove after duration
  const duration = toast.duration || 5000
  setTimeout(() => {
    removeToast(id)
  }, duration)

  return id
}

function removeToast(id: string) {
  const index = toasts.findIndex(toast => toast.id === id)
  if (index > -1) {
    toasts.splice(index, 1)
    listeners.forEach(listener => listener([...toasts]))
  }
}

export function useToast() {
  const [currentToasts, setCurrentToasts] = useState<Toast[]>([...toasts])

  const toast = useCallback((toast: Omit<Toast, 'id'>) => {
    return addToast(toast)
  }, [])

  const dismiss = useCallback((id: string) => {
    removeToast(id)
  }, [])

  // Subscribe to toast changes
  useState(() => {
    listeners.add(setCurrentToasts)
    return () => {
      listeners.delete(setCurrentToasts)
    }
  })

  return {
    toasts: currentToasts,
    toast,
    dismiss
  }
}