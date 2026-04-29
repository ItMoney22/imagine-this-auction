import { AuthForm } from '@/components/auth/auth-form'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export default async function SignupPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Join ImagineThisAuction to start bidding on amazing items
          </p>
        </div>
        <AuthForm mode="signup" />
        <p className="text-center text-sm text-slate-600">
          Want to sell on the marketplace? Create an account, then{' '}
          <Link href="/become-auctioneer" className="font-semibold text-indigo-600 hover:text-indigo-700">
            submit your auctioneer license
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
