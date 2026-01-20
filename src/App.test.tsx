import { render, screen } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';

describe('App', () => {
  it('renders the home page', () => {
    render(
      <HelmetProvider>
        <App />
      </HelmetProvider>,
    );

    expect(screen.getByText(/Welcome to Template App/i)).toBeInTheDocument();
  });
});
