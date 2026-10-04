import { useEffect, useState } from 'react'

export type Theme = 'system' | 'light' | 'dark' | 'black'
const KEY = 'portfolio-tracker:theme'
const THEME_COLOR = { light: '#f8fafc', dark: '#020617', black: '#000000' }

function read(): Theme {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' || t === 'black' ? t : 'system'
  } catch {
    return 'system'
  }
}

/** Applies the theme as classes on <html>; index.html runs the same logic before first paint to avoid a flash. */
export function applyTheme(theme: Theme) {
  const systemDark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
  const dark = theme === 'dark' || theme === 'black' || (theme === 'system' && systemDark)
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.classList.toggle('black', theme === 'black')
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'black' ? THEME_COLOR.black : dark ? THEME_COLOR.dark : THEME_COLOR.light)
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(read)

  useEffect(() => {
    applyTheme(theme)
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      /* ignore */
    }
    if (theme !== 'system' || typeof matchMedia === 'undefined') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  return [theme, setTheme] as const
}
