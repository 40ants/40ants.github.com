# Source Code SEO Review

Use this file when the user asks to review a website project, not a live URL.

This is especially useful for frameworks such as Next.js, Nuxt, Astro, Remix, and similar app-based sites.

## What To Inspect First

- main layout files
- page templates
- metadata definitions
- `robots.txt` generator or static file
- `sitemap.xml` generator or static file
- canonical logic
- social preview tags
- schema output
- image components
- route structure

## High-Value Checks

### Metadata

Check:

- unique page titles;
- useful meta descriptions;
- correct canonical URLs;
- no site-wide copy-paste metadata on every important page.

### Indexing

Check:

- pages that should be hidden use the right noindex logic;
- filters, search pages, and internal utility pages are not accidentally indexable;
- important pages are not blocked by mistake.

### Sitemap and Robots

Check:

- sitemap includes the important public pages;
- sitemap excludes junk pages;
- robots rules do not block core assets or key content;
- staging or preview rules are not leaking into production logic.

### Rendering

Check:

- important text exists in server output or initial HTML when possible;
- critical content is not hidden behind client-only rendering;
- titles, canonicals, and schema are not injected too late.

### Schema

Check:

- schema type fits the page;
- required fields are present;
- no placeholder text remains;
- schema values come from real page data.

### Images

Check:

- width and height or equivalent sizing is set;
- alt text is passed correctly;
- image components do not break social previews or LCP.

## Next.js-Specific Checks

For Next.js projects, inspect:

- `app/layout.*`
- `app/page.*`
- route groups and dynamic routes
- `generateMetadata`
- static `metadata`
- `robots.ts` or `robots.txt`
- `sitemap.ts` or `sitemap.xml`
- `not-found.*`
- `opengraph-image.*` and `twitter-image.*`
- server vs client component split on important pages

## Common Mistakes

- one title template for every page without unique page detail;
- missing canonical on paginated or parameter-driven pages;
- sitemap includes preview, tag, search, or duplicate pages;
- metadata only on the homepage;
- client-only landing pages with weak initial HTML;
- schema hardcoded with fake values;
- images missing dimensions;
- staging domain left in canonical or Open Graph tags.

## How To Report Findings

Prefer this order:

1. pages or templates that block indexing or damage discovery;
2. metadata and canonical issues;
3. sitemap and robots mistakes;
4. schema problems;
5. image and performance hints;
6. lower-priority polish items.
