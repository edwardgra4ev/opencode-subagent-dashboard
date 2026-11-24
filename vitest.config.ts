import { defineConfig } from "vitest/config"

// Separate from vite.config.ts on purpose: the model module is pure TypeScript
// and needs no Solid/JSX/gui plugin (which only the GUI build requires).
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
})
