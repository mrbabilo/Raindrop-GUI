export interface Connection { baseUrl: string; token: string; }

export function getConnection(): Connection {
  if (typeof window !== "undefined" && window.RAINDROP_GUI) {
    const { port, token } = window.RAINDROP_GUI;
    return { baseUrl: `http://127.0.0.1:${port}`, token };
  }
  // dev : proxy Vite même origine (port lu du lockfile par vite.config)
  return { baseUrl: "", token: import.meta.env.VITE_LOCAL_API_TOKEN ?? "" };
}
