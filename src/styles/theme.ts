import { createTheme, responsiveFontSizes, Theme } from '@mui/material/styles';

export const getAppTheme = (mode: 'light' | 'dark'): Theme => {
  let theme = createTheme({
    palette: {
      mode,
      primary: {
        main: mode === 'dark' ? '#667eea' : '#5568d3',
        light: '#8b9bfa',
        dark: '#4c5ed1',
      },
      secondary: {
        main: mode === 'dark' ? '#764ba2' : '#6a3d94',
        light: '#9d6bc8',
        dark: '#5a3680',
      },
      background: {
        default: mode === 'dark' ? '#0f0f1e' : '#f5f5f5',
        paper: mode === 'dark' ? '#1a1a2e' : '#ffffff',
      },
      error: {
        main: '#f44336',
      },
      warning: {
        main: '#ffa726',
      },
      success: {
        main: '#66bb6a',
      },
      info: {
        main: '#29b6f6',
      },
    },
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
      h1: {
        fontWeight: 700,
      },
      h2: {
        fontWeight: 700,
      },
      h3: {
        fontWeight: 700,
      },
      h4: {
        fontWeight: 600,
      },
      h5: {
        fontWeight: 600,
      },
      h6: {
        fontWeight: 600,
      },
    },
    shape: {
      borderRadius: 12,
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 8,
          },
          contained: {
            boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)',
            '&:hover': {
              boxShadow: '0 6px 16px rgba(102, 126, 234, 0.4)',
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
          elevation1: {
            boxShadow: mode === 'dark' ? '0 2px 8px rgba(0, 0, 0, 0.4)' : '0 2px 8px rgba(0, 0, 0, 0.1)',
          },
          elevation2: {
            boxShadow: mode === 'dark' ? '0 4px 12px rgba(0, 0, 0, 0.4)' : '0 4px 12px rgba(0, 0, 0, 0.1)',
          },
          elevation3: {
            boxShadow: mode === 'dark' ? '0 6px 16px rgba(0, 0, 0, 0.4)' : '0 6px 16px rgba(0, 0, 0, 0.1)',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 12,
          },
        },
      },
    },
  });
  theme = responsiveFontSizes(theme);
  return theme;
};
