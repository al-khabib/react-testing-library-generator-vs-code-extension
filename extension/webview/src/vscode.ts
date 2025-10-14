/* eslint-disable @typescript-eslint/no-explicit-any */
type VsCodeApi = {
  postMessage: (message: any) => void;
  setState: (state: any) => void;
  getState: () => any;
};

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

let vscodeApi: VsCodeApi | null = null;

export const getVsCodeAPI = (): VsCodeApi => {
  if (!vscodeApi) {
    vscodeApi = window.acquireVsCodeApi ? window.acquireVsCodeApi() : (null as unknown as VsCodeApi);
  }

  return vscodeApi;
};

export const postMessage = (type: string, payload?: unknown) => {
  const api = getVsCodeAPI();
  if (api) {
    api.postMessage({ type, payload });
  }
};

export const getState = <T>(): T | undefined => {
  const api = getVsCodeAPI();
  if (!api) {
    return undefined;
  }
  return api.getState() as T;
};

export const setState = (state: unknown) => {
  const api = getVsCodeAPI();
  if (api) {
    api.setState(state);
  }
};
