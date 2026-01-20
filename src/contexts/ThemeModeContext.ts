import { createContext } from 'react';

interface ThemeModeContextType {
  toggleThemeMode: () => void;
}

export const ThemeModeContext = createContext<ThemeModeContextType>({
  toggleThemeMode: () => {},
});
