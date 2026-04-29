'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'

const magicLinkSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
})

const passwordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type MagicLinkForm = z.infer<typeof magicLinkSchema>
type PasswordForm = z.infer<typeof passwordSchema>

interface AuthFormProps {
  mode: 'login' | 'signup'
  redirectTo?: string
}

export function AuthForm({ mode, redirectTo }: AuthFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [authMode, setAuthMode] = useState<'magic' | 'password'>('password') // Default to password for demo

  const supabase = createClient()

  const magicForm = useForm<MagicLinkForm>({
    resolver: zodResolver(magicLinkSchema),
  })

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  })

  const onMagicLinkSubmit = async (data: MagicLinkForm) => {
    setIsLoading(true)
    setMessage(null)
    setError(null)

    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: data.email,
        options: {
          emailRedirectTo: redirectTo || `${window.location.origin}/auth/callback`,
        },
      })

      if (authError) {
        setError(authError.message)
      } else {
        setMessage('Check your email for the magic link!')
      }
    } catch {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const onPasswordSubmit = async (data: PasswordForm) => {
    setIsLoading(true)
    setMessage(null)
    setError(null)

    try {
      let authError
      if (mode === 'login') {
        const result = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        })
        authError = result.error
      } else {
        const result = await supabase.auth.signUp({
          email: data.email,
          password: data.password,
          options: {
            emailRedirectTo: redirectTo || `${window.location.origin}/auth/callback`,
          },
        })
        authError = result.error
      }

      if (authError) {
        setError(authError.message)
      } else {
        if (mode === 'login') {
          window.location.href = redirectTo || '/dashboard'
        } else {
          setMessage('Check your email to confirm your account!')
        }
      }
    } catch {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white shadow-md rounded-lg px-8 pt-6 pb-8 mb-4">
        <h2 className="text-2xl font-bold text-center mb-6">
          {mode === 'login' ? 'Sign In' : 'Sign Up'}
        </h2>

        {/* Auth Mode Toggle */}
        <div className="mb-6">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setAuthMode('password')}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                authMode === 'password'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Email & Password
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('magic')}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                authMode === 'magic'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Magic Link
            </button>
          </div>
          <p className="mt-3 text-sm text-gray-600">
            {authMode === 'password'
              ? 'Sign in with your password. Minimum 6 characters.'
              : 'Get a one-time login link emailed to you.'}
          </p>
        </div>

        {authMode === 'password' ? (
          <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <input
                {...passwordForm.register('email')}
                type="email"
                id="email"
                placeholder="Enter your email"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
              {passwordForm.formState.errors.email && (
                <p className="mt-1 text-sm text-red-600">{passwordForm.formState.errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                {...passwordForm.register('password')}
                type="password"
                id="password"
                placeholder="Enter your password"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">Minimum 6 characters</p>
              {passwordForm.formState.errors.password && (
                <p className="mt-1 text-sm text-red-600">{passwordForm.formState.errors.password.message}</p>
              )}
            </div>

            {mode === 'login' && (
              <div className="text-right">
                <Link href="/forgot-password" className="text-sm font-medium text-blue-600 hover:text-blue-500">
                  Forgot password?
                </Link>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (mode === 'login' ? 'Signing in...' : 'Creating account...') : (mode === 'login' ? 'Sign In' : 'Sign Up')}
            </button>
          </form>
        ) : (
          <form onSubmit={magicForm.handleSubmit(onMagicLinkSubmit)} className="space-y-4">
            <div>
              <label htmlFor="magic-email" className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <input
                {...magicForm.register('email')}
                type="email"
                id="magic-email"
                placeholder="Enter your email"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
              {magicForm.formState.errors.email && (
                <p className="mt-1 text-sm text-red-600">{magicForm.formState.errors.email.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Sending...' : 'Send Magic Link'}
            </button>
          </form>
        )}

        {message && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-600">{message}</p>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <a
              href={mode === 'login' ? '/signup' : '/login'}
              className="font-medium text-blue-600 hover:text-blue-500"
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
