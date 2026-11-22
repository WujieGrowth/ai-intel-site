import { defineConfig } from "astro/config";

const rawBase = process.env.PUBLIC_BASE_PATH ?? "/";
const trimmed = rawBase.trim();
const base =
  trimmed === "" || trimmed === "/"
    ? "/"
    : `/${trimmed.replace(/^\/+|\/+$/g, "")}/`;

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL ?? "https://example.com",
  base,
  trailingSlash: "always",
  build: {
    format: "directory",
  },
});
