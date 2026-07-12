import { createContext, useContext } from 'react'

export const ThemeContext = createContext<{
  darkMode: boolean
  setDarkMode: (v: boolean) => void
}>({ darkMode: true, setDarkMode: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}
