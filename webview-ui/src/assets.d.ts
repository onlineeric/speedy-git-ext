/**
 * An imported image is its content as a `data:` URL: the webview build inlines
 * every asset (`assetsInlineLimit` in `vite.config.ts`), shown under the CSP's
 * `img-src data:`.
 */
declare module '*.png' {
  const dataUrl: string;
  export default dataUrl;
}
