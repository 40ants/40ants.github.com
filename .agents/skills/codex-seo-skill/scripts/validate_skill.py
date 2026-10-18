#!/usr/bin/env python3
"""
Small stdlib-only validator for the Codex SEO skill repository.
"""

from __future__ import annotations

from pathlib import Path


REQUIRED_FILES = [
    "SKILL.md",
    "README.md",
    "LICENSE",
    "agents/openai.yaml",
]

REQUIRED_README_SECTIONS = [
    "## What This Is",
    "## Installation",
    "## Quick Start",
    "## Quick Prompt Guide",
    "## What To Paste Into Codex",
    "## What You Can Hire Me For",
    "## Contact",
]


def fail(message: str) -> None:
    print(f"[FAIL] {message}")
    raise SystemExit(1)


def ok(message: str) -> None:
    print(f"[OK] {message}")


def load_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        fail(f"Missing file: {path}")
    except UnicodeDecodeError:
        fail(f"File is not valid UTF-8: {path}")
    assert False


def parse_frontmatter(skill_path: Path) -> dict[str, str]:
    text = load_text(skill_path)
    lines = text.splitlines()

    if not lines or lines[0].strip() != "---":
        fail("SKILL.md must start with YAML frontmatter")

    end_index = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end_index = i
            break

    if end_index is None:
        fail("SKILL.md frontmatter is not closed with ---")

    fields: dict[str, str] = {}
    for line in lines[1:end_index]:
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        fields[key.strip()] = value.strip()

    return fields


def main() -> None:
    root = Path(__file__).resolve().parents[1]

    for rel_path in REQUIRED_FILES:
        path = root / rel_path
        if not path.exists():
            fail(f"Missing required file: {rel_path}")
        ok(f"Found {rel_path}")

    skill_fields = parse_frontmatter(root / "SKILL.md")
    if skill_fields.get("name") != "seo":
        fail("SKILL.md frontmatter must contain name: seo")
    ok("SKILL.md frontmatter contains name: seo")

    if not skill_fields.get("description"):
        fail("SKILL.md frontmatter must contain a non-empty description")
    ok("SKILL.md frontmatter contains description")

    references_dir = root / "references"
    if not references_dir.exists():
        fail("references/ directory is missing")
    reference_files = sorted(references_dir.glob("*.md"))
    if not reference_files:
        fail("references/ must contain at least one markdown file")
    ok(f"Found {len(reference_files)} reference files")

    assets_dir = root / "assets"
    if not assets_dir.exists():
        fail("assets/ directory is missing")
    ok("Found assets/ directory")

    readme = load_text(root / "README.md")
    for section in REQUIRED_README_SECTIONS:
        if section not in readme:
            fail(f"README.md is missing section: {section}")
    ok("README.md contains the main sections")

    openai_yaml = load_text(root / "agents" / "openai.yaml")
    if "display_name:" not in openai_yaml or "default_prompt:" not in openai_yaml:
        fail("agents/openai.yaml is missing required interface fields")
    ok("agents/openai.yaml contains key interface fields")

    print("\nSkill repository looks good.")


if __name__ == "__main__":
    main()
