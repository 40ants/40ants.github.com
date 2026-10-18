---
name: seo
description: Run full SEO audits, single-page reviews, technical SEO checks, content quality reviews, Schema.org validation, image SEO checks, sitemap reviews, hreflang checks, local SEO reviews, AI search readiness reviews, source-code SEO reviews, and SEO strategy planning. Use when the user asks to audit a site, review rankings, check robots.txt, sitemap.xml, canonical tags, meta tags, Core Web Vitals, indexing, schema, internal linking, local pages, llms.txt, AI search visibility, or review a website codebase such as Next.js for SEO mistakes before launch.
---

# SEO

## Overview

Use this skill to inspect a website and turn findings into a short, practical fix plan.
Always verify live pages when the site is reachable. If a page or file cannot be reached, say so clearly and do not guess.
If the user gives a codebase instead of a public URL, inspect the source files directly and review SEO at code level.

Write the final answer in the user's language and explain issues in plain language.

## Quick Start

Examples of requests this skill should handle:

- `Run a full SEO audit for https://example.com`
- `Review the SEO of https://example.com/pricing`
- `Check the technical SEO of https://example.com`
- `Check schema on the homepage`
- `Make an SEO plan for a SaaS site`
- `Check whether this site is ready for AI search`
- `Review local SEO for this clinic website`
- `Review my Next.js codebase for SEO issues before launch`

## Mode Selection

Choose the smallest mode that matches the request:

- Full audit: overall diagnosis and fix order
- Single page: one URL only
- Technical SEO: indexing, crawlability, canonicals, speed hints, mobile, redirects
- Content quality: usefulness, trust, expertise, originality
- Schema: detection, validation, missing opportunities
- Images: alt text, file size, format, dimensions
- AI search: bots, llms.txt, answer formatting, citability
- Source code review: framework metadata, sitemap, robots, canonicals, schema, rendering
- Strategy: site structure, page priorities, content plan

## Standard Workflow

1. Confirm the scope: whole site, one page, one SEO area, or local codebase review.
2. Collect facts from the site or codebase: homepage, important pages, `robots.txt`, `sitemap.xml`, metadata files, route files, templates, and other sources as needed.
3. Detect business type: SaaS, local business, ecommerce, publisher, agency, or general business.
4. Separate findings by priority: `Critical`, `High`, `Medium`, `Low`.
5. Explain each issue as:
   - what is wrong;
   - why it matters;
   - what to change first.
6. If coverage is limited, state the limitation clearly.

## Full Audit Checklist

For a representative audit, check:

- site availability and status codes;
- `robots.txt` and `sitemap.xml`;
- indexability: `noindex`, canonicals, redirect chains, duplicate URLs;
- on-page basics: `title`, `meta description`, `H1-H3`, URL quality, internal links;
- content quality and trust signals;
- `Schema.org`;
- images;
- speed hints for `LCP`, `INP`, and `CLS`;
- AI search readiness.

For large sites, start with a sample:

- homepage;
- 3-5 main money pages;
- 2-5 articles or product pages;
- contact, about, pricing;
- `robots.txt` and `sitemap.xml`.

Do not call it a full crawl if you only reviewed a sample.

## Single Page Checklist

- `title`
- `meta description`
- `H1` and heading structure
- URL quality
- canonical and robots directives
- Open Graph and Twitter tags when relevant
- content usefulness and trust signals
- image handling
- `Schema.org`

## Technical SEO Checklist

- `robots.txt`
- `sitemap.xml`
- canonicals
- `meta robots`
- redirects
- duplicate paths and parameters
- HTTPS and basic security headers
- mobile parity
- JavaScript dependency for critical content
- speed hints using `LCP`, `INP`, `CLS`

Use these reference files when needed:

- [core-web-vitals.md](./references/core-web-vitals.md)
- [quality-gates.md](./references/quality-gates.md)
- [geo-ai-search.md](./references/geo-ai-search.md)

## Source Code SEO Checklist

Use this mode when the user asks to review project files instead of a live site.

- metadata generation
- page titles and descriptions
- canonical handling
- `robots.txt` generation
- `sitemap.xml` generation
- Open Graph and social tags
- JSON-LD or other schema output
- heading structure in templates
- image components and missing dimensions
- locale and hreflang handling
- pagination and indexability rules
- server-rendered vs client-only critical content

Use [source-code-seo.md](./references/source-code-seo.md).

## Content Quality Checklist

Judge more than word count:

- does the page satisfy the query intent;
- does it show real experience or proof;
- can the reader see who wrote it;
- are there examples, facts, data, or sources;
- does the page feel original or mass-generated.

Use [eeat.md](./references/eeat.md) for trust and quality checks.

## Schema Checklist

- prefer `JSON-LD`;
- check whether the schema type fits the page;
- check required properties;
- flag outdated or risky recommendations.

Use [schema-types.md](./references/schema-types.md).

Hard rules:

- never recommend `HowTo` for Google;
- do not sell `FAQPage` as a Google rich result shortcut for normal commercial sites;
- use valid URLs and valid dates in examples.

## AI Search Checklist

- check whether `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `ClaudeBot`, or `PerplexityBot` are blocked;
- check whether `/llms.txt` exists;
- check whether the page contains short, self-contained answer blocks;
- check whether headings, lists, tables, and facts make the page easy to quote;
- check whether key content is visible without heavy client-side JavaScript.

Use [geo-ai-search.md](./references/geo-ai-search.md).

## Planning and Site Structure

When the user asks for a strategy, base the answer on the right template:

- SaaS: [saas-plan.md](./assets/saas-plan.md)
- Local business: [local-service-plan.md](./assets/local-service-plan.md)
- Ecommerce: [ecommerce-plan.md](./assets/ecommerce-plan.md)
- Publisher: [publisher-plan.md](./assets/publisher-plan.md)
- Agency: [agency-plan.md](./assets/agency-plan.md)
- General business: [generic-plan.md](./assets/generic-plan.md)

Always include:

- which pages to build first;
- which schema types matter first;
- which content types matter first;
- which metrics to watch;
- which scaling risks to avoid.

## Rules You Must Keep

- Do not invent content from blocked or unreachable pages.
- Do not call a review complete if it is only a sample.
- Put indexing, blocking, duplicate, and thin-content issues above cosmetic advice.
- For location pages, warn at `30+` pages and hard-stop at `50+` pages unless there is a strong business reason.
- Prefer `JSON-LD` for new schema examples.
- If the user is a beginner, give a short plain-language summary before deeper detail.

## Default Output Shape

Unless the user asks for a special format, answer in this order:

1. Short diagnosis
2. Top issues by priority
3. Quick wins
4. Fix plan for the next 1-2 weeks
5. Review limits, if any

## Resources

Load only what is needed:

- `references/core-web-vitals.md`
- `references/eeat.md`
- `references/quality-gates.md`
- `references/schema-types.md`
- `references/geo-ai-search.md`
- `references/local-seo.md`
- `references/source-code-seo.md`
