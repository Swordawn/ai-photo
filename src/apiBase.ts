const API_URL = import.meta.env.VITE_API_URL || ''

/**
 * 发起 API 请求，自动拼接服务器地址
 * 本地开发：相对路径（通过 Vite proxy）
 * 生产环境（Pages）：指向服务器地址
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, init)
}

export function getApiBase(): string {
  return API_URL
}
