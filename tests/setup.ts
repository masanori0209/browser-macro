import { beforeEach, vi } from "vitest";

type StorageData = Record<string, unknown>;

const storageData: StorageData = {};

function resetStorage() {
  for (const key of Object.keys(storageData)) {
    delete storageData[key];
  }
}

function createChromeMock() {
  const listeners: {
    updated: Array<(tabId: number, changeInfo: any, tab: any) => void>;
    command: Array<(cmd: string) => void>;
    message: Array<(msg: any, sender: any, sendResponse: (resp: any) => void) => void>;
  } = {
    updated: [],
    command: [],
    message: []
  };

  const chromeMock: any = {
    runtime: {
      lastError: null,
      onMessage: {
        addListener: vi.fn((fn: (msg: any, sender: any, sendResponse: (resp: any) => void) => void) => listeners.message.push(fn))
      }
    },
    storage: {
      local: {
        get: vi.fn((keys: string[] | Record<string, unknown>, cb: (items: StorageData) => void) => {
          if (Array.isArray(keys)) {
            const result: StorageData = {};
            keys.forEach((k) => (result[k] = storageData[k]));
            cb(result);
            return;
          }
          cb({ ...keys });
        }),
        set: vi.fn((items: StorageData, cb: () => void) => {
          Object.assign(storageData, items);
          cb();
        })
      }
    },
    tabs: {
      query: vi.fn((_query: any, cb: (tabs: Array<{ id: number }>) => void) => {
        cb([{ id: 1 }]);
      }),
      sendMessage: vi.fn((_tabId: number, payload: any, cb: (resp: any) => void) => {
        cb({ type: "STEP_RESULT", stepId: payload.step.id, success: true });
      }),
      onUpdated: {
        addListener: vi.fn((fn: (tabId: number, changeInfo: any, tab: any) => void) => listeners.updated.push(fn))
      }
    },
    alarms: {
      create: vi.fn(),
      onAlarm: { addListener: vi.fn() }
    },
    commands: {
      onCommand: { addListener: vi.fn((fn: (command: string) => void) => listeners.command.push(fn)) }
    },
    __emitTabUpdated: (tabId: number, changeInfo: any, tab: any) => {
      listeners.updated.forEach((fn) => fn(tabId, changeInfo, tab));
    },
    __emitCommand: (command: string) => {
      listeners.command.forEach((fn) => fn(command));
    },
    __emitMessage: (msg: any, sender: any = {}, sendResponse: (resp: any) => void = () => {}) => {
      listeners.message.forEach((fn) => fn(msg, sender, sendResponse));
    }
  };

  return chromeMock;
}

beforeEach(() => {
  resetStorage();
  (globalThis as any).chrome = createChromeMock();
});

