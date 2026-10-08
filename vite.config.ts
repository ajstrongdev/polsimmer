import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

const config = defineConfig(({ mode }) => {
  const profile = loadEnv(mode, process.cwd(), "VITE_INSTANCE_CONFIG").VITE_INSTANCE_CONFIG;
  if (profile && !profile.trimStart().startsWith("{")) {
    process.env.VITE_INSTANCE_CONFIG = readFileSync(resolve(profile), "utf8");
  }
  return {
    // pg's optional native binding must stay in Node's CommonJS resolution path.
    // Bundling pg turns the absent pg-native peer into a startup-time 500.
    ssr: { external: ["pg"] },
    plugins: [
      ...(process.env.OSCANA_E2E === "1" ? [] : [devtools()]),
      nitro({
        rollupConfig: {
          external: ["pg"],
          treeshake: {
            moduleSideEffects: (id) => id.includes("node-forge"),
          },
        },
      }),
      // this is the plugin that enables path aliases
      viteTsConfigPaths({
        projects: ["./tsconfig.json"],
      }),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
    ],
  };
});

export default config;
