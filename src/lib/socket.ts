// Mock socket implementation to silence socket.io in client-side-only mode
const noop = () => {};

export const socket: any = {
  emit: (event: string, ...args: any[]) => {
    console.log(`[Socket Mock] emit event: ${event}`, args);
  },
  on: (event: string, callback: any) => {
    return socket;
  },
  off: (event: string, callback: any) => {
    return socket;
  },
  connected: false,
  id: "mock-socket-id",
  connect: noop,
  disconnect: noop,
};
