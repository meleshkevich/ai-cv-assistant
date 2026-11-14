import { vi, beforeEach } from 'vitest'

// In-memory chrome.storage.local store — reset before each test.
const store: Record<string, unknown> = {}

function makeChromeMock() {
  return {
    storage: {
      local: {
        get: vi.fn((key: string) => Promise.resolve({ [key]: store[key] })),
        set: vi.fn((items: Record<string, unknown>) => {
          Object.assign(store, items)
          return Promise.resolve()
        }),
      },
    },
  }
}

let chromeMock = makeChromeMock()

Object.defineProperty(globalThis, 'chrome', {
  get: () => chromeMock,
  configurable: true,
})

// Before each test: wipe the store and rebuild fresh mock instances.
// This prevents one test's mock.mockImplementation() override from bleeding into the next.
beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k])
  chromeMock = makeChromeMock()
})
