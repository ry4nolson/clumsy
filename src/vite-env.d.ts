/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

declare module "pdfjs-dist/build/pdf.sandbox.mjs" {
  export function QuickJSSandbox(wasmUrl: string): Promise<{
    support: { win: unknown } | null;
    create(data: unknown): void;
    dispatchEvent(event: unknown): void;
    nukeSandbox(): void;
  }>;
}
