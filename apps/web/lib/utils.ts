import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format amount in cents to display as dollars with ITC equivalent
// 100 ITC = $1.00
export function formatCurrency(amountInCents: number | undefined | null, showITC = true) {
  if (amountInCents == null || amountInCents === 0) {
    return showITC ? '$0.00 (0 ITC)' : '$0.00'
  }
  const dollars = (amountInCents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  })
  if (showITC) {
    return `${dollars} (${amountInCents.toLocaleString()} ITC)`
  }
  return dollars
}

// Format just the dollar amount without ITC
export function formatDollars(amountInCents: number | undefined | null) {
  if (amountInCents == null || amountInCents === 0) return '$0.00'
  return (amountInCents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  })
}

// Format just ITC amount
export function formatITC(amount: number | undefined | null) {
  if (amount == null) return '0 ITC'
  return `${amount.toLocaleString()} ITC`
}

export function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function formatTimeRemaining(endDate: string | Date) {
  const now = new Date().getTime()
  const end = new Date(endDate).getTime()
  const diff = end - now

  if (diff <= 0) {
    return 'Ended'
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)

  if (days > 0) {
    return `${days}d ${hours}h`
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  } else {
    return `${seconds}s`
  }
}