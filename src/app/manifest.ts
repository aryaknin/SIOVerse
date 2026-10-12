import type { MetadataRoute } from "next";

export function sioverseManifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "SIOVerse — SIO OS",
    short_name: "SIOVerse",
    description: "Le bureau numérique de la classe SIO.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#071024",
    theme_color: "#247fc3",
    orientation: "any",
    categories: ["education", "productivity", "social"],
    prefer_related_applications: false,
    icons: [
      { src: "/icons/sioverse-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/sioverse-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/sioverse-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}

export default sioverseManifest;
