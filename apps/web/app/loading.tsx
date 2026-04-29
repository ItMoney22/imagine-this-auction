export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
        <p className="text-sm text-slate-500 font-medium">Loading...</p>
      </div>
    </div>
  )
}
