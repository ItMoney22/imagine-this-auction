export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="animate-pulse space-y-8">
        <div className="h-6 bg-slate-200 rounded w-32" />
        <div className="space-y-3">
          <div className="h-10 bg-slate-200 rounded-lg w-80" />
          <div className="h-4 bg-slate-200 rounded w-64" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="aspect-square bg-slate-200" />
                  <div className="p-4 space-y-2">
                    <div className="h-5 bg-slate-200 rounded w-3/4" />
                    <div className="h-6 bg-slate-200 rounded w-20" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div className="h-48 bg-slate-200 rounded-2xl" />
            <div className="h-32 bg-slate-200 rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  )
}
