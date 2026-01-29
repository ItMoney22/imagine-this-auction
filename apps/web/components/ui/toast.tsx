'use client'

import { useEffect } from 'react'
import { X, CheckCircle, AlertTriangle, Info } from 'lucide-react'
import { useToast, Toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface ToastProps {
  toast: Toast
  onDismiss: (id: string) => void
}

function ToastComponent({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    const duration = toast.duration || 5000
    const timer = setTimeout(() => {
      onDismiss(toast.id)
    }, duration)

    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, onDismiss])

  const getIcon = () => {
    switch (toast.variant) {
      case 'destructive':
        return <AlertTriangle className="h-4 w-4" />
      default:
        return <CheckCircle className="h-4 w-4" />
    }
  }

  const getStyles = () => {
    switch (toast.variant) {
      case 'destructive':
        return 'bg-red-50 border-red-200 text-red-800'
      default:
        return 'bg-green-50 border-green-200 text-green-800'
    }
  }

  return (
    <div
      className={cn(
        'flex items-start p-4 rounded-lg border shadow-lg',
        getStyles()
      )}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex-shrink-0 mr-3 mt-0.5">
        {getIcon()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-medium">
          {toast.title}
        </div>
        {toast.description && (
          <div className="mt-1 text-sm opacity-90">
            {toast.description}
          </div>
        )}
      </div>

      <button
        onClick={() => onDismiss(toast.id)}
        className="flex-shrink-0 ml-3 p-1 rounded-md hover:bg-black/10 transition-colors"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function Toaster() {
  const { toasts, dismiss } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
      {toasts.map((toast) => (
        <ToastComponent
          key={toast.id}
          toast={toast}
          onDismiss={dismiss}
        />
      ))}
    </div>
  )
}