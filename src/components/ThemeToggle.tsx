import type { Theme } from '../hooks/useTheme'

const OPTIONS: { id: Theme; icon: string; label: string }[] = [
  { id: 'light', icon: '☀', label: 'Light' },
  { id: 'dark', icon: '☾', label: 'Dark' },
  { id: 'black', icon: '●', label: 'Black' },
  { id: 'system', icon: 'A', label: 'Auto (match device)' },
]

/** Compact theme switch for the header. */
export function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-700"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={theme === o.id}
          aria-label={o.label}
          title={o.label}
          onClick={() => onChange(o.id)}
          className={`h-7 w-7 rounded-md text-sm leading-none ${theme === o.id ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
        >
          {o.icon}
        </button>
      ))}
    </div>
  )
}
