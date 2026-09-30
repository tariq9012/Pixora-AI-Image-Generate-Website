import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vite";

// PHASE 14: TanStack Start deploys to Vercel through the Nitro Vite plugin
// (`nitro` is already a devDependency). It is enabled only for Vercel builds
// (Vercel sets VERCEL=1) or an explicit `vite build --mode vercel`
// (`npm run build:vercel`), so local `npm run dev` / `npm run build` keep
// behaving exactly as they did in Phases 1-13.
export default defineConfig(async ({ mode }) => {
  const useNitro = mode === "vercel" || Boolean(process.env["VERCEL"]);
  const nitroPlugins = useNitro ? [(await import("nitro/vite")).nitro()] : [];

  return {
    resolve: {
      // Prevent duplicate React/TanStack instances if a package ends up
      // hoisted or linked inconsistently in node_modules.
      dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"],
    },
    plugins: [
      // NOTE: kept on purpose. Vite 8 can resolve tsconfig paths natively
      // (`resolve.tsconfigPaths: true`), but removing this plugin was not
      // verifiable without running the build. See docs/PRODUCTION.md.
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tailwindcss(),
      tanstackStart({
        // Route TanStack Start's bundled server entry through src/server.ts
        // (our SSR error wrapper + security headers) instead of the
        // framework default.
        server: { entry: "server" },
      }),
      ...nitroPlugins,
      viteReact(),
    ],
  };
});
