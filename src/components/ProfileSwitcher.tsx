import { useState, type FormEvent } from 'react'
import type { Profile } from '../types'
import { Button, Field, inputClass, Modal } from './ui'

interface Props {
  profiles: Profile[]
  activeId: string
  onSwitch: (id: string) => void
  onAdd: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  /** True while the all-funds overview is open. */
  allFunds?: boolean
  onAllFunds?: () => void
}

type Mode = { kind: 'add' } | { kind: 'rename' } | { kind: 'delete' } | null

export function ProfileSwitcher(props: Props) {
  const { profiles, activeId, onSwitch, onAdd, onRename, onDelete, allFunds = false, onAllFunds } = props
  const active = profiles.find((p) => p.id === activeId) ?? profiles[0]
  const [mode, setMode] = useState<Mode>(null)
  const [name, setName] = useState('')

  const open = (m: NonNullable<Mode>) => {
    setName(m.kind === 'rename' ? active.name : '')
    setMode(m)
  }
  const close = () => setMode(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    if (mode?.kind === 'add') onAdd(name)
    if (mode?.kind === 'rename') onRename(active.id, name)
    close()
  }

  return (
    <div className="flex items-center gap-1">
      <label className="sr-only" htmlFor="profile-select">
        Profile
      </label>
      <select
        id="profile-select"
        className={`${inputClass} w-auto max-w-[11rem] py-1.5 font-medium`}
        value={allFunds ? '__all' : active.id}
        onChange={(e) => {
          const v = e.target.value
          if (v === '__new') open({ kind: 'add' })
          else if (v === '__all') onAllFunds?.()
          else onSwitch(v)
        }}
      >
        {onAllFunds && profiles.length > 1 && <option value="__all">All funds ({profiles.length})</option>}
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        <option value="__new">+ New profile…</option>
      </select>
      {!allFunds && (
        <Button
          variant="ghost"
          className="px-2"
          aria-label="Rename profile"
          title="Rename profile"
          onClick={() => open({ kind: 'rename' })}
        >
          ✎
        </Button>
      )}
      {!allFunds && profiles.length > 1 && (
        <Button
          variant="ghost"
          className="px-2"
          aria-label="Delete profile"
          title="Delete profile"
          onClick={() => open({ kind: 'delete' })}
        >
          🗑
        </Button>
      )}

      {mode?.kind === 'delete' && (
        <Modal title="Delete profile" onClose={close}>
          <p className="text-sm">
            Delete <strong>{active.name}</strong> and its {active.lots.length} purchase(s)? This cannot be undone.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button onClick={close}>Cancel</Button>
            <Button
              variant="danger"
              data-autofocus
              onClick={() => {
                onDelete(active.id)
                close()
              }}
            >
              Delete profile
            </Button>
          </div>
        </Modal>
      )}
      {(mode?.kind === 'add' || mode?.kind === 'rename') && (
        <Modal title={mode.kind === 'add' ? 'New profile' : 'Rename profile'} onClose={close}>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Profile name">
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Retirement"
                maxLength={40}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button onClick={close}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={!name.trim()}>
                {mode.kind === 'add' ? 'Create' : 'Save'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
