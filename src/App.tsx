import { CssBaseline, ThemeProvider } from '@mui/material';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Home } from './pages/Home';
import { Admin } from './pages/Admin';

import { getAppTheme } from './styles/theme';

function App() {
  const theme = getAppTheme('dark');

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <ErrorBoundary>
          <Layout>
            <Routes>
              <Route path='/' element={<Home />} />
              <Route path='/admin' element={<Admin />} />
            </Routes>
          </Layout>
        </ErrorBoundary>
      </Router>
    </ThemeProvider>
  );
}

export default App;
