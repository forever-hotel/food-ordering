// Jest setup for React component tests in jsdom

// Polyfill window.matchMedia for Ant Design responsive features
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  // Polyfill ResizeObserver
  window.ResizeObserver =
    window.ResizeObserver ||
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

  // Polyfill scrollTo
  window.scrollTo = window.scrollTo || (() => {});

  // Polyfill getComputedStyle pseudoElt for Ant Design Modal scroll locker
  const originalGetComputedStyle = window.getComputedStyle;
  window.getComputedStyle = function (elt: Element, pseudoElt?: string | null) {
    if (pseudoElt) {
      return originalGetComputedStyle.call(window, elt);
    }
    return originalGetComputedStyle.call(window, elt, pseudoElt);
  };
}

jest.mock('next/font/google', () => ({
  Geist: () => ({ variable: '--font-geist-sans' }),
  Geist_Mono: () => ({ variable: '--font-geist-mono' }),
}));
