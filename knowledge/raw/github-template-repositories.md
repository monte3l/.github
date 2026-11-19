---
url: https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template
accessed: 2026-11-19
---

# Creating a repository from a template

**Source:** https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template · **Kind:** primary · **Accessed:** 2026-11-19

## What it says

- A repository created from a template gets the same directory structure, branches and files, from the default branch only or from all branches.
- `gh repo create` can do the same from the command line.

## Quotes

> "Branches created from a template have unrelated histories"

## Caveats

- The page says nothing about settings, rulesets, secrets or labels, so they cannot be assumed to be copied. That is an inference from what the page leaves out.
- Because the histories are unrelated, a later change to the template cannot be merged into repositories created from it. The page says you cannot create pull requests or merge between such branches.
