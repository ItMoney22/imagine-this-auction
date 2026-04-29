export default function Loading() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="animate-pulse space-y-8">
        <div className="space-y-3">
          <div className="h-8 bg-slate-200 rounded-lg w-56" />
          <div className="h-4 bg-slate-200 rounded w-80" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
            <div className="h-5 bg-slate-200 rounded w-40" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex justify-between items-center">
                  <div className="space-y-1">
                    <div className="h-4 bg-slate-200 rounded w-32" />
                    <div className="h-3 bg-slate-200 rounded w-48" />
                  </div>
                  <div className="h-6 w-11 bg-slate-200 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
