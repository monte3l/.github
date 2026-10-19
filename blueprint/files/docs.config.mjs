// SPDX-FileCopyrightText: 2026 Enrico Lionello (enri3l), Giulia Montevecchi (giulmonte), monte3l
// SPDX-License-Identifier: MIT

// Docs kit config. The kit is design/source/docs-kit/ (vendored from m3l-design);
// its README documents every key. Every tracked *.md file must be a page or be
// excluded with a reason, or `node design/source/docs-kit/build.mjs --check` fails.
export default {
  title: "PROJECT",
  repo: "https://github.com/monte3l/PROJECT",
  siteUrl: "https://PROJECT.monte3l.com",
  designDir: "design",
  // manifest: "package.json", // or ".claude-plugin/plugin.json": its homepage must equal siteUrl
  navGroups: ["Start", "Project", "Security"],
  pages: [
    { src: "README.md", out: "index.html", group: "Start", label: "Overview" },
    { src: "CONTRIBUTING.md", out: "CONTRIBUTING.html", group: "Project", label: "Contributing" },
    { src: "SECURITY.md", out: "SECURITY.html", group: "Security", label: "Security policy" },
  ],
  exclude: [
    { glob: "CHANGELOG.md", reason: "release notes live on the GitHub releases page" },
    { glob: ".claude/**", reason: "instructions for coding agents, not reader-facing" },
  ],
  // generators: ["scripts/site/example.mjs"], // pages that cannot come from Markdown
  // parity: ["scripts/doc-parity.mjs"],       // docs-versus-code checks, see lib/parity.mjs
};
