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

  // Polyfill MessageChannel for Ant Design / @rc-component/select in jsdom
  if (typeof globalThis.MessageChannel === 'undefined') {
    globalThis.MessageChannel = class MessageChannel {
      port1: MessagePort;
      port2: MessagePort;
      constructor() {
        const p1 = {
          onmessage: null as ((ev: MessageEvent) => void) | null,
          postMessage: (data: unknown) => {
            setTimeout(() => p2.onmessage?.({ data } as MessageEvent), 0);
          },
          close: () => {},
          start: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        } as unknown as MessagePort;
        const p2 = {
          onmessage: null as ((ev: MessageEvent) => void) | null,
          postMessage: (data: unknown) => {
            setTimeout(() => p1.onmessage?.({ data } as MessageEvent), 0);
          },
          close: () => {},
          start: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        } as unknown as MessagePort;
        this.port1 = p1;
        this.port2 = p2;
      }
    } as unknown as typeof MessageChannel;
  }

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
