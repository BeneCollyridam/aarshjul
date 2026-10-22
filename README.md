# Årshjul

A single-page **A4 landscape** year planner in Typst:

- **Left:** January–June, with event titles, dates and descriptions.
- **Middle:** a clockwise, twelve-sector year wheel with event titles.
- **Right:** July–December, with event titles, dates and descriptions.

Requires Typst (tested with 0.15.1). Run `nix develop` to use the included development shell. No external Typst packages are required.

## Compile

From this directory, using the included example:

```sh
typst compile arshjul.typ arshjul.pdf
```

Use your own JSON file (path relative to `arshjul.typ`, inside the Typst project root):

```sh
typst compile --input data-file=plan.json arshjul.typ arshjul.pdf
```

Or supply JSON from stdin, without needing to put the input file inside the project:

```sh
cat /path/to/plan.json | typst compile --input "data=$(cat)" arshjul.typ arshjul.pdf
```

The inline `data` input takes precedence over `data-file`. These are Typst compile-time inputs; the JSON is treated as data, not Typst markup.

## JSON format

```json
{
  "title": "Årshjul",
  "year": 2027,
  "subtitle": "Team activities",
  "footer": "Updated January 2027",
  "events": [
    {
      "month": 1,
      "title": "Kick-off",
      "date": "12 Jan",
      "description": "Agree on goals, responsibilities and priorities."
    },
    { "month": 1, "title": "Workshop", "description": "Review the roadmap." }
  ]
}
```

All top-level fields are optional. Defaults: `Årshjul`, current year, no subtitle/footer, Danish month names, no events. Each event requires an integer `month` (1–12) and a nonempty `title`; `date` and `description` are optional strings. Multiple events per month appear in input order. Dates are display labels, not parsed calendar dates.

Optional customization:

- `months`: exactly twelve nonempty month-name strings, January first.
- `colors`: four color strings, one per quarter, e.g. `["#527C96", "#588570", "#B78743", "#966476"]`.

Descriptions stay in the side columns; only titles appear in the wheel. Text shrinks modestly to accommodate longer content. If a month still cannot fit legibly, compilation fails with the month's name instead of silently clipping text. Keep wheel titles short and descriptions concise: this is a one-page overview, not an unlimited calendar. The fixed-height header and footer are intended for short, single-line text (plus the subtitle).

## Checks

```sh
bash test_render.sh
```
