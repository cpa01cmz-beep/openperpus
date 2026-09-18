import type { MetadataRoute } from "next";

/** PWA manifest — nama generik, identitas asli diisi dinamis via library_settings. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Perpustakaan",
    short_name: "Perpus",
    description: "Katalog, berita, dan layanan perpustakaan.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#047857",
    lang: "id",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
