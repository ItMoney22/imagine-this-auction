export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="animate-pulse space-y-8">
        <div className="space-y-3">
          <div className="h-8 bg-slate-200 rounded-lg w-48" />
          <div className="h-4 bg-slate-200 rounded w-64" />
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between">
            <div className="h-5 bg-slate-200 rounded w-32" />
            <div className="h-5 bg-slate-200 rounded w-24" />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <div className="space-y-2 flex-1">
                <div className="h-4 bg-slate-200 rounded w-40" />
                <div className="h-3 bg-slate-200 rounded w-24" />
              </div>
              <div className="h-6 bg-slate-200 rounded w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
