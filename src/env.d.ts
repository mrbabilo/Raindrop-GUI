interface Window {
  RAINDROP_GUI?: { port: number; token: string };
}
interface ImportMetaEnv {
  readonly VITE_LOCAL_API_TOKEN?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
