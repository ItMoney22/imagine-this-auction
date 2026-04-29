export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="animate-pulse space-y-8">
        <div className="space-y-3">
          <div className="h-8 bg-slate-200 rounded-lg w-48" />
          <div className="h-4 bg-slate-200 rounded w-72" />
        </div>
        <div className="flex gap-6">
          <div className="flex-1 h-11 bg-slate-200 rounded-xl" />
          <div className="w-64 h-11 bg-slate-200 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="p-4 space-y-2">
                <div className="h-4 bg-slate-200 rounded w-20" />
                <div className="h-5 bg-slate-200 rounded w-3/4" />
              </div>
              <div className="aspect-square bg-slate-200 mx-4 rounded-lg" />
              <div className="p-4 space-y-3">
                <div className="h-4 bg-slate-200 rounded w-full" />
                <div className="h-6 bg-slate-200 rounded w-24" />
                <div className="h-10 bg-purple-200 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
