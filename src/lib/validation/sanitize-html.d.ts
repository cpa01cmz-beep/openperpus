// ponytail: type minimal untuk sanitize-html (tanpa @types dep);
// upgrade path: npm i -D @types/sanitize-html lalu hapus file ini.
declare module 'sanitize-html' {
  interface SanitizeOptions {
    allowedTags?: string[] | false;
    allowedAttributes?: Record<string, string[]>;
    allowedSchemes?: string[];
    allowProtocolRelative?: boolean;
    disallowedTagsMode?: 'discard' | 'escape' | 'recursiveEscape';
  }
  function sanitizeHtml(dirty: string, options?: SanitizeOptions): string;
  export default sanitizeHtml;
}
