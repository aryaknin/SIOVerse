import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SIOVerse — SIO OS",
    short_name: "SIOVerse",
    description: "Le bureau numérique de la classe SIO.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#071024",
    theme_color: "#247fc3",
    orientation: "any",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
