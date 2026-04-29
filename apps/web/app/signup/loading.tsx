export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md mx-auto p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-slate-200 rounded-lg w-40 mx-auto" />
          <div className="h-4 bg-slate-200 rounded w-56 mx-auto" />
          <div className="space-y-4 mt-8">
            <div className="h-11 bg-slate-200 rounded-xl" />
            <div className="h-11 bg-slate-200 rounded-xl" />
            <div className="h-11 bg-purple-200 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  )
}
