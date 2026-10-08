import { useRegisterActions } from 'kbar';
import { useTheme } from 'next-themes';

const useThemeSwitching = () => {
  const { theme, setTheme } = useTheme();

  const toggleDarkLight = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const themeActions = [
    {
      id: 'toggleDarkLight',
      name: 'Farbschema wechseln (hell/dunkel)',
      shortcut: ['d', 'd'],
      section: 'Farbschema',
      perform: toggleDarkLight
    },
    {
      id: 'setLightTheme',
      name: 'Helles Farbschema',
      section: 'Farbschema',
      perform: () => setTheme('light')
    },
    {
      id: 'setDarkTheme',
      name: 'Dunkles Farbschema',
      section: 'Farbschema',
      perform: () => setTheme('dark')
    }
  ];

  useRegisterActions(themeActions, [theme]);
};

export default useThemeSwitching;
