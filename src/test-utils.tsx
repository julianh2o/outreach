import React, { ReactElement, ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { vi } from 'vitest';

/**
 * Options for renderWithProviders
 */
interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  initialRoute?: string;
}

/**
 * Renders a component with all necessary providers (Router + Helmet)
 */
export const renderWithProviders = (
  ui: ReactElement,
  { initialRoute = '/', ...renderOptions }: RenderWithProvidersOptions = {},
) => {
  window.history.pushState({}, 'Test page', initialRoute);

  const Wrapper = ({ children }: { children: ReactNode }) => {
    return (
      <HelmetProvider>
        <BrowserRouter>{children}</BrowserRouter>
      </HelmetProvider>
    );
  };

  return render(ui, { wrapper: Wrapper, ...renderOptions });
};

/**
 * Renders a component with just the Router (no other providers)
 */
export const renderWithRouter = (
  ui: ReactElement,
  { initialRoute = '/', ...renderOptions }: { initialRoute?: string } & Omit<RenderOptions, 'wrapper'> = {},
) => {
  window.history.pushState({}, 'Test page', initialRoute);

  const Wrapper = ({ children }: { children: ReactNode }) => {
    return <BrowserRouter>{children}</BrowserRouter>;
  };

  return render(ui, { wrapper: Wrapper, ...renderOptions });
};

/**
 * Mock localStorage
 */
export const mockLocalStorage = () => {
  const storage: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string) => storage[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      storage[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete storage[key];
    }),
    clear: vi.fn(() => {
      Object.keys(storage).forEach((key) => delete storage[key]);
    }),
    get length() {
      return Object.keys(storage).length;
    },
    key: vi.fn((index: number) => Object.keys(storage)[index] || null),
  };
};

/**
 * Sets up localStorage mock
 */
export const setupLocalStorageMock = () => {
  const mockStorage = mockLocalStorage();
  Object.defineProperty(window, 'localStorage', {
    value: mockStorage,
    writable: true,
  });
  return mockStorage;
};
