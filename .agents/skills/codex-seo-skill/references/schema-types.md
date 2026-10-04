# Schema Types

Prefer `JSON-LD`.

## Common Safe Recommendations

| Type | Good For |
|---|---|
| Organization | company pages |
| LocalBusiness | local business pages |
| Service | service pages |
| Product | product pages |
| Offer | pricing and availability |
| WebSite | site-wide schema |
| WebPage | page-level schema |
| Article / BlogPosting | blog and editorial pages |
| BreadcrumbList | breadcrumbs |
| Person | author and expert pages |
| SoftwareApplication / WebApplication | SaaS pages |
| Review / AggregateRating | real review data |
| VideoObject | video pages |
| Event | event pages |
| JobPosting | job pages |
| ProfilePage | author profile pages |

## Restricted

### FAQPage

Do not pitch `FAQPage` as a Google rich result shortcut for a normal commercial site.
It can still help page structure and sometimes help AI citation use cases, but it is not a strong Google-rich-result play for most businesses.

## Do Not Recommend

| Type | Reason |
|---|---|
| HowTo | no longer a reliable Google rich result target |
| SpecialAnnouncement | outdated |

## Validation Checklist

Before recommending or fixing schema, check:

1. `@context` is `https://schema.org`
2. `@type` matches the page
3. required fields exist
4. there is no placeholder text
5. URLs are absolute
6. dates are valid

Do not stop at "schema exists". Explain:

- which type is present;
- what is broken;
- what is missing;
- what improvement the fix can bring.
