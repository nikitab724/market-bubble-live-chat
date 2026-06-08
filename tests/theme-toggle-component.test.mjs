import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

function repoUrl(path) {
  return new URL(`../${path}`, import.meta.url);
}

function readRepoFile(path) {
  return readFileSync(repoUrl(path), "utf8");
}

describe("theme toggle component integration", () => {
  it("exposes the shadcn-style ThemeToggle component and demo without replacing existing demos", () => {
    assert.equal(existsSync(repoUrl("components/ui/theme-toggle.tsx")), true);

    const component = readRepoFile("components/ui/theme-toggle.tsx");
    const demo = readRepoFile("components/ui/demo.tsx");

    assert.match(component, /^"use client"/);
    assert.match(component, /import \{ Moon, Sun \} from "lucide-react"/);
    assert.match(component, /import \{ cn \} from "@\/lib\/utils"/);
    assert.match(component, /interface ThemeToggleProps/);
    assert.match(component, /export function ThemeToggle\(/);
    assert.match(component, /role="button"/);
    assert.match(component, /tabIndex=\{0\}/);

    assert.match(demo, /import \{ ThemeToggle \} from "@\/components\/ui\/theme-toggle"/);
    assert.match(demo, /function DefaultToggle\(\)/);
    assert.match(demo, /<ThemeToggle \/>/);
    assert.match(demo, /export \{ CountAnimationExamle, DefaultToggle \};/);
  });

  it("installs lucide-react for the toggle icons", () => {
    const pkg = JSON.parse(readRepoFile("package.json"));

    assert.equal(pkg.dependencies["lucide-react"].startsWith("^"), true);
  });
});
