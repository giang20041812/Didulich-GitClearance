import axios, { type AxiosRequestConfig } from 'axios';

const pending = new Map<string, Promise<unknown>>();

/** Share concurrent reads within one session; completed responses are never cached. */
export function partnerGet<T>(url: string, config: AxiosRequestConfig): Promise<T> {
  const key = JSON.stringify([url, config.params, config.headers, config.timeout, axios.defaults.baseURL]);
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;

  const request = axios.get<T>(url, config).then(response => response.data).finally(() => {
    pending.delete(key);
  });
  pending.set(key, request);
  return request;
}
