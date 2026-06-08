import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function readRepoFile(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("count animation component integration", () => {
  it("exposes the shadcn-style CountAnimation component and demo", () => {
    const component = readRepoFile("components/ui/count-animation.tsx");
    const demo = readRepoFile("components/ui/demo.tsx");

    assert.match(component, /^"use client";/);
    assert.match(component, /import \{ cn \} from "@\/lib\/utils";/);
    assert.match(component, /from "framer-motion";/);
    assert.match(component, /function CountAnimation\(/);
    assert.match(component, /number:\s*number/);
    assert.match(component, /className:\s*string/);
    assert.match(component, /useMotionValue\(0\)/);
    assert.match(component, /useTransform\(count, Math\.round\)/);
    assert.match(component, /animate\(count, number, \{ duration: 2 \}\)/);
    assert.match(component, /return <motion\.h1 className=\{cn\(className\)\}>\{rounded\}<\/motion\.h1>;/);
    assert.match(component, /export \{ CountAnimation \};/);

    assert.match(demo, /import \{ CountAnimation \} from "@\/components\/ui\/count-animation";/);
    assert.match(demo, /<CountAnimation number=\{60\} className="text-4xl" \/>/);
    assert.match(demo, /export \{ CountAnimationExamle \};/);
  });

  it("supports the component's TypeScript, shadcn alias, and required dependencies", () => {
    const pkg = JSON.parse(readRepoFile("package.json"));
    const tsconfig = JSON.parse(readRepoFile("tsconfig.json"));
    const viteConfig = readRepoFile("vite.config.mjs");
    const shadcnConfig = JSON.parse(readRepoFile("components.json"));
    const utils = readRepoFile("lib/utils.ts");

    assert.equal(pkg.dependencies["framer-motion"].startsWith("^"), true);
    assert.equal(pkg.dependencies.clsx.startsWith("^"), true);
    assert.equal(pkg.dependencies["tailwind-merge"].startsWith("^"), true);
    assert.equal(pkg.devDependencies.typescript.startsWith("^"), true);
    assert.equal(pkg.devDependencies["@types/react"].startsWith("^"), true);
    assert.equal(pkg.devDependencies["@types/react-dom"].startsWith("^"), true);

    assert.deepEqual(tsconfig.compilerOptions.paths["@/*"], ["./*"]);
    assert.match(viteConfig, /alias:\s*\{[^}]*"@": fileURLToPath\(new URL\("\.", import\.meta\.url\)\)/s);
    assert.equal(shadcnConfig.tsx, true);
    assert.equal(shadcnConfig.tailwind.css, "src/ui/tailwind.css");
    assert.equal(shadcnConfig.aliases.ui, "@/components/ui");
    assert.equal(shadcnConfig.aliases.utils, "@/lib/utils");
    assert.match(utils, /export function cn\(\.\.\.inputs: ClassValue\[\]\)/);
  });
});
