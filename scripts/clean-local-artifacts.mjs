import { rmSync } from "node:fs";
import { resolve } from "node:path";

const targets = [
  ".next",
  "coverage",
  "dist",
  "build",
  ".vercel",
  "tsconfig.tsbuildinfo",
  "supabase/.temp"
];

for (const target of targets) {
  const absoluteTarget = resolve(process.cwd(), target);
  rmSync(absoluteTarget, {
    force: true,
    recursive: true
  });
  console.log(`Removed ${target}`);
}
