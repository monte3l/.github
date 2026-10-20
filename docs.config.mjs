// SPDX-FileCopyrightText: Copyright (c) 2026 Enrico Lionello
// SPDX-License-Identifier: MIT

// The monte3l org site (monte3l.com). The home page is the org profile README,
// so the site and the GitHub profile can never say different things.
export default {
  title: "monte3l",
  repo: "https://github.com/monte3l/.github",
  siteUrl: "https://monte3l.com",
  designDir: "design",
  navGroups: ["Start", "Standard", "Community"],
  nav: [
    { href: "index.html", label: "Projects" },
    { href: "standard.html", label: "Engineering standard" },
    { href: "https://github.com/monte3l", label: "GitHub" },
  ],
  pages: [
    { src: "profile/README.md", out: "index.html", group: "Start", label: "Overview" },
    { src: "blueprint/README.md", out: "standard.html", group: "Standard", label: "Engineering standard" },
    { src: "blueprint/docs-site.md", out: "docs-site.html", group: "Standard", label: "Docs site runbook" },
    { src: "design/README.md", out: "design.html", group: "Standard", label: "Design system" },
    { src: "CODE_OF_CONDUCT.md", out: "CODE_OF_CONDUCT.html", group: "Community", label: "Code of conduct" },
    { src: "CONTRIBUTING.md", out: "CONTRIBUTING.html", group: "Community", label: "Contributing" },
    { src: "SECURITY.md", out: "SECURITY.html", group: "Community", label: "Security policy" },
    { src: "SUPPORT.md", out: "SUPPORT.html", group: "Community", label: "Support" },
  ],
  exclude: [
    { glob: "README.md", reason: "describes this repository for GitHub readers; the profile README is the site home" },
    { glob: "CLAUDE.md", reason: "instructions for coding agents, not reader-facing" },
    { glob: ".claude/**", reason: "Claude Code agents, skills and hooks for working in this repository" },
    { glob: "blueprint/files/README.md", reason: "README skeleton with placeholders, copied rather than read" },
    { glob: ".github/pull_request_template.md", reason: "GitHub pull request template" },
    { glob: ".groundwork/**", reason: "m3l-groundwork adoption and customization reports, a record for maintainers" },
    { glob: "docs/research/**", reason: "Claude Code harness refresh tracker, maintainer notes" },
  ],
  generators: ["bin/site/templates.mjs", "bin/site/baseline.mjs"],
  parity: ["bin/doc-parity.mjs"],
};
