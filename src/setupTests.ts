import '@testing-library/jest-dom';

// Mock matchMedia for jsdom
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

// Mock Storage quota estimate
if (typeof navigator !== 'undefined') {
  Object.defineProperty(navigator, 'storage', {
    writable: true,
    value: {
      estimate: async () => ({ usage: 5000000, quota: 100000000 }),
    },
  });
}
