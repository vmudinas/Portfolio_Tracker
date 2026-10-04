import { useState, type FormEvent } from 'react'
import { Button, Field, inputClass, Modal } from './ui'

export function CashDialog({
  cash,
  onSave,
  onClose,
}: {
  cash: number
  onSave: (n: number) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(cash ? String(cash) : '')
  const [error, setError] = useState<string>()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const n = value.trim() === '' ? 0 : Number(value)
    if (!(n >= 0)) return setError('Enter 0 or more')
    onSave(n)
    onClose()
  }
  return (
    <Modal title="Cash balance" onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field
          label="Uninvested cash ($)"
          error={error}
          hint="Counts toward total value and allocation. Update it by hand."
        >
          <input
            className={inputClass}
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}
