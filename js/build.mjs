import { build } from "esbuild";

const shared = { entryPoints: ["src/index.ts"], bundle: true, target: "es2020", legalComments: "none" };

await build({ ...shared, format: "esm", outfile: "dist/index.js", external: ["modern-screenshot"] });
await build({ ...shared, format: "iife", globalName: "EchoFeedback", minify: true, outfile: "dist/echo-feedback.iife.js" });
