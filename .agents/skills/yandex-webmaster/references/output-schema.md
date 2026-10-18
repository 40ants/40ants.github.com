# Snapshot output schema

`snapshot` writes a JSON object with these top-level fields:

- `schemaVersion`: Snapshot schema version.
- `source`: Always `yandex-webmaster-api` for API-backed snapshots.
- `fetchedAt`: UTC timestamp when the fetch completed.
- `host`: Exact API identity and metadata: `userId`, `hostId`, URLs, display name, verification state, and `hostDataStatus`.
- `period`: Inclusive requested `startDate` and `endDate`.
- `deviceType`: `ALL`, `DESKTOP`, `MOBILE_AND_TABLET`, `MOBILE`, or `TABLET`.
- `queryOrderBy`: `TOTAL_SHOWS` or `TOTAL_CLICKS`.
- `dataState`: Always `service-defined`; Yandex does not expose a finalized-data selector.
- `dataAvailability`: `available`, `host-not-loaded`, or `host-not-indexed`, plus a human-readable message.
- `dataThrough`: Latest daily date returned by the API, when available.
- `datasets`: Named results.

Default datasets:

- `summary`: Aggregate metrics derived from the `date` dataset.
- `date`: Daily metrics for all search queries.
- `query`: Popular query rows, paged up to Yandex's Top-3000 source limit.

Every dataset includes `dimensions`, `rowCount`, `dataCompleteness`, and `rows`.

The `date` dataset also includes `deviceType`. Its normalized rows contain:

```json
{
  "date": "2026-07-20",
  "clicks": 12,
  "impressions": 900,
  "ctr": 0.0133333333,
  "position": 8.4
}
```

The `summary` dataset contains one row with the same metric fields except `date`. Its `position` is impression-weighted from daily average show positions. Use this row for authoritative host totals; do not derive totals from popular queries.

The `query` dataset also includes:

- `orderBy`: API sorting indicator.
- `reportedCount`: Total query count reported by the API, bounded by the platform's Top-3000 source.
- `pagesFetched`: Number of API pages requested.
- `truncated`: Whether the configured local maximum omitted additional API-available rows.
- `sourceLimit`: Always `3000`.
- `returnedPeriod`: `startDate` and `endDate` returned by Yandex. These can be narrower than the requested period.

Query rows contain:

```json
{
  "query": "example review",
  "clicks": 7,
  "impressions": 420,
  "ctr": 0.0166666667,
  "position": 6.2
}
```

`query.dataCompleteness` is `top-queries`. Query rows are evidence for prioritization and comparison, not a complete census and not a page-attribution dataset.

When Yandex returns `HOST_NOT_LOADED` or `HOST_NOT_INDEXED`, the CLI still writes a snapshot. Its `dataAvailability.state` records the condition and requested datasets are present with empty rows. Do not interpret this as confirmed zero clicks or impressions.

The command prints a compact summary to stdout and stores the full snapshot at the reported `path`. Saving also updates a small `latest.json` pointer for that exact host ID.
