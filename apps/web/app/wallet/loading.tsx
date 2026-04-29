export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="animate-pulse space-y-8">
        <div className="space-y-3">
          <div className="h-8 bg-slate-200 rounded-lg w-40" />
          <div className="h-4 bg-slate-200 rounded w-64" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-3">
            <div className="h-4 bg-slate-200 rounded w-24" />
            <div className="h-10 bg-slate-200 rounded w-32" />
            <div className="h-4 bg-slate-200 rounded w-40" />
          </div>
          <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
            <div className="h-5 bg-slate-200 rounded w-32" />
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 bg-slate-200 rounded-lg" />
              ))}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
          <div className="h-5 bg-slate-200 rounded w-40" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex justify-between items-center py-3">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 bg-slate-200 rounded-full" />
                <div className="space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-24" />
                  <div className="h-3 bg-slate-200 rounded w-32" />
                </div>
              </div>
              <div className="h-5 bg-slate-200 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
