import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount) {
  if (!amount) return 'N/A'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(dateString) {
  if (!dateString) return 'N/A'
  try {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date)
  } catch {
    return dateString
  }
}

export function getDaysUntil(dateString) {
  if (!dateString) return null
  try {
    const deadline = new Date(dateString)
    const today = new Date()
    const diffTime = deadline - today
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  } catch {
    return null
  }
}

export function getSourceBadgeColor(source) {
  const colors = {
    grants: 'bg-blue-100 text-blue-800',
    sam: 'bg-green-100 text-green-800',
    usaspending: 'bg-purple-100 text-purple-800',
  }
  return colors[source] || 'bg-gray-100 text-gray-800'
}

