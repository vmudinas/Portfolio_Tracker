import { Button, Card } from './ui'

export function EmptyState({ onAdd, onLoadSample }: { onAdd: () => void; onLoadSample: () => void }) {
  return (
    <Card className="px-6 py-14 text-center">
      <h2 className="text-lg font-semibold">No stocks in this portfolio yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">
        Add a ticker, how many shares you bought and the price you paid. We’ll show what you’ve earned or lost.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button variant="primary" onClick={onAdd}>
          + Add your first stock
        </Button>
        <Button onClick={onLoadSample}>Load sample portfolio</Button>
      </div>
    </Card>
  )
}
