export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="animate-pulse space-y-8">
        <div className="space-y-3">
          <div className="h-8 bg-slate-200 rounded-lg w-64" />
          <div className="h-4 bg-slate-200 rounded w-80" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow p-6 space-y-4">
              <div className="h-5 bg-slate-200 rounded w-24" />
              <div className="h-8 bg-slate-200 rounded w-20" />
              <div className="h-4 bg-slate-200 rounded w-32" />
              <div className="h-10 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="h-5 bg-slate-200 rounded w-32" />
          </div>
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-4 bg-slate-200 rounded w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
