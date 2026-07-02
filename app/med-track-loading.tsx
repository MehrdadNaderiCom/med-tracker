export function MedTrackLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5faf8] px-4 py-10 text-zinc-950">
      <section className="w-full max-w-md rounded-lg border border-emerald-100 bg-white p-6 text-center shadow-sm sm:p-8">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-600 text-white">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        </div>
        <h1 className="text-2xl font-semibold tracking-normal text-zinc-950">
          MedTrack
        </h1>
        <p className="mt-2 text-sm text-zinc-500">Loading your tracker...</p>
      </section>
    </main>
  );
}
