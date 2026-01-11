import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/tools/mcp.ts",
    "src/tools/vercel.ts",
    "src/tools/openai.ts",
    "src/tools/generic.ts",
    "src/schemas/index.ts",
  ],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  treeshake: true,
  external: ["zod"],
});
