'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface UserInterest {
  id?: string
  category?: string
}

interface Props {
  userId: string
  userInterests: UserInterest[]
  availableCategories: string[]
}

export function InterestTags({ userId, userInterests, availableCategories }: Props) {
  const supabase = createClient()
  const [interests, setInterests] = useState(userInterests)
  const [savingCategory, setSavingCategory] = useState<string | null>(null)

  const isSelected = (cat: string) => interests.some(i => i.category === cat)

  const toggle = async (cat: string) => {
    try {
      setSavingCategory(cat)

      if (isSelected(cat)) {
        const { error } = await supabase
          .from('user_interests')
          .delete()
          .eq('user_id', userId)
          .eq('category', cat)

        if (error) throw error

        setInterests(prev => prev.filter(i => i.category !== cat))
      } else {
        const { data, error } = await supabase
          .from('user_interests')
          .insert({ user_id: userId, category: cat })
          .select('id, category, created_at')
          .single()

        if (error) throw error

        setInterests(prev => [...prev, data])
      }
    } catch (error) {
      console.error('Failed to update interests:', error)
      toast.error('Failed to update interest tags')
    } finally {
      setSavingCategory(null)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Interest Tags</h2>
      <p className="text-sm text-gray-500 mb-4">Select categories you're interested in to receive relevant notifications.</p>
      <div className="flex flex-wrap gap-2">
        {availableCategories.map(cat => (
          <button
            key={cat}
            onClick={() => toggle(cat)}
            disabled={savingCategory === cat}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              isSelected(cat)
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {cat}
          </button>
        ))}
        {availableCategories.length === 0 && (
          <p className="text-gray-400 text-sm">No categories available.</p>
        )}
      </div>
    </div>
  )
}
