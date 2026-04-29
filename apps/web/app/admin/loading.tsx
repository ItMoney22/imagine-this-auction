export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="animate-pulse space-y-8">
          <div className="space-y-3">
            <div className="h-8 bg-slate-200 rounded-lg w-48" />
            <div className="h-4 bg-slate-200 rounded w-72" />
          </div>
          <div className="flex space-x-1 rounded-lg bg-gray-200 p-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex-1 h-9 bg-slate-300 rounded-md" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow-sm border p-6 space-y-3">
                <div className="h-8 bg-slate-200 rounded w-16" />
                <div className="h-4 bg-slate-200 rounded w-32" />
                <div className="h-3 bg-slate-200 rounded w-24" />
              </div>
            ))}
          </div>
          <div className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
            <div className="h-5 bg-slate-200 rounded w-36" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex justify-between items-center border-b pb-3">
                <div className="space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-48" />
                  <div className="h-3 bg-slate-200 rounded w-36" />
                </div>
                <div className="h-6 bg-slate-200 rounded w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
