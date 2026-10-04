function App() {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-8">
      <header className="flex items-center gap-3">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-9 w-9" />
        <h1 className="text-2xl font-semibold tracking-tight">Portfolio Tracker</h1>
      </header>

      <main className="mt-10 flex-1">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-medium">Track your stocks</h2>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Add a ticker, the shares you own and the price you paid — see what you have earned or lost.
          </p>
          <p className="mt-4 inline-block rounded-full bg-teal-50 px-3 py-1 text-sm font-medium text-teal-700 dark:bg-teal-950 dark:text-teal-300">
            Coming soon
          </p>
        </section>
      </main>

      <footer className="mt-10 text-sm text-slate-500">
        Your data stays in this browser. Not financial advice.
      </footer>
    </div>
  )
}

export default App
