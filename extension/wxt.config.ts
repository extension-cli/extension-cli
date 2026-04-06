import { defineConfig } from "wxt";

export default defineConfig({
  entrypointsDir: "entrypoints",
  outDir: ".output",
  dev: {
    server: {
      host: "127.0.0.1",
      port: 19884,
      origin: "http://127.0.0.1:19884",
    },
  },
  vite: () => ({
    server: {
      host: "127.0.0.1",
      port: 19884,
      strictPort: true,
      hmr: {
        host: "127.0.0.1",
        port: 19885,
      },
    },
  }),
  manifest: {
    name: "extension-cli",
    description:
      "Browser automation bridge for extension-cli. Executes commands in isolated Chrome windows via a local daemon.",
    permissions: [
      "debugger",
      "scripting",
      "tabs",
      "tabGroups",
      "cookies",
      "activeTab",
      "alarms",
    ],
    optional_permissions: ["bookmarks", "history", "sessions"],
    host_permissions: ["<all_urls>"],
    icons: {
      "16": "/icons/icon-16.png",
      "32": "/icons/icon-32.png",
      "48": "/icons/icon-48.png",
      "128": "/icons/icon-128.png",
    },
    action: {
      default_title: "extension-cli",
      default_icon: {
        "16": "/icons/icon-16.png",
        "32": "/icons/icon-32.png",
      },
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
    homepage_url: "https://github.com/robertshaw/extension-cli",
  },
});
