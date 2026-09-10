# Link Builder

A separate project that lives inside the GeoLAB site tree. Workspace rules from
`~/kwandel/CLAUDE.md` apply; the GeoLAB site's own conventions live in
`geolab_regiohub/README.md`, and the finders' in `destatis-rag/CLAUDE.md`.

**Live, unlisted:** <https://geolab.soz.uni-bielefeld.de/tools/link-builder/>

## What it is, in one paragraph

A visual planner for one specific job: attaching German regional data to microdata. You put the
table you analyse on a canvas, put the regional data next to it, drag a line between the columns
that should meet, and the page tells you what that particular design gets wrong and writes the R
and Stata script with the guards already in it. It never touches data and runs nothing. The point
is the middle part: a regional linkage looks like a one-line join and is not, and every way it
fails is silent. The area codes change over time, several geographies overlap instead of nesting,
the years describe different reference dates, and a lookup table with one row too many multiplies
the sample. The code runs, the numbers look plausible, and nobody notices for months.

Started 2026-09-09 at Konstantin's request, after finding an undeployed 2026 prototype at
`~/kwandel/soep-data-combiner` (React Flow + DuckDB-WASM, ~7k lines, data symlinks into a
`/mnt/extra` that no longer exists). He asked for a new one rather than a revival of that, so
nothing was carried over from it.

## Why it is unlisted, and how that is enforced

It is a prototype he wants to look at, not something to publish. Three separate mechanisms, because
one of them will eventually be forgotten:

1. `<meta name="robots" content="noindex, nofollow, noarchive">` in `index.html`.
2. `Disallow: /tools/` in `robots.txt`, written by `scripts/add_canonical.py` after every render.
   That script also **skips every HTML file under `tools/`** when it stamps canonical links: a
   canonical is an invitation to index, which is the opposite of what this page wants.
3. Nothing on the site links to it, and Quarto's sitemap only lists rendered pages, so a folder
   shipped as a resource cannot appear in it. Verified after each publish.

## How it is deployed

It is **not** a separate service. `tools/link-builder` is listed under `resources:` in
`_quarto.yml`, so `quarto render` copies it into `_site/tools/link-builder/` and the ordinary
`bash publish_live.sh` puts it live. That matters: `publish_live.sh` rsyncs with `--delete`, so
anything dropped into `/opt/geolab/sites/geolab/` by hand disappears at the next publish. Being a
resource is what makes it survive.

## Two places, one source

Work happens **here**, in the GeoLAB site tree, because that is what gets rendered and published.
The public repository <https://github.com/KonstantinWandel/geolab-link-builder> is a mirror, the
same arrangement `destatis-rag` and `soep-variable-finder` already use. Bring it up to date with
`bash ~/kwandel/geolab-link-builder/sync_from_site.sh`, then commit and push there. An edit made
only in the mirror is lost at the next sync.

## The files

```
index.html        shell, the pre-paint theme script, the CSP-free asset links
app.css           the GeoLAB tokens again (one blue, one red, no radii), light and dark
knowledge.js      THE DOMAIN MODEL: key types, what matches what, reforms, source notes, templates
app.js            state, catalogue, palette, canvas, checks, code generation, the guide
catalogue.json    GENERATED, 1.8 MB (156 KB over the wire), do not edit
CLAUDE.md         this file
```

No dependencies, no build step. Three files and a JSON, served statically.

## knowledge.js is the part with the value in it

`app.js` is plumbing. The thing worth maintaining is `knowledge.js`:

- **`KEYS`** the key types and their `family` (`geo` / `time` / `unit`) and `rank` (how fine the
  geography is). Two columns can only meet if their families agree; the ranks decide whether a
  link copies a value downwards or needs an aggregation upwards.
- **`matchKeys(a, b)`** returns the mode: `direct`, `derive` (cut the code to n digits),
  `crosswalk` (a lookup table), `weighted` (the geographies overlap, so the mapping has shares),
  `spatial` (they meet on a map, not in a table), or `no`. Each carries the sentence that explains
  why, in the language of the thing rather than of the software.
- **`BRIDGE_FOR` / `bridgeFor()`** which bridge block repairs which pair. This is what lets a check
  offer an **Insert the bridge** button instead of only complaining. GPS on one side and a postcode
  on the other is the case the whole tool exists for.
- **`REFORMS`** the five district reforms that break a time series (Saxony-Anhalt 2007, Saxony 2008,
  Städteregion Aachen 2009, Mecklenburg-Western Pomerania 2011, Göttingen/Osterode 2016). Municipal
  reforms are not listed because there is no year without one; that is said instead.
- **`SOURCE_NOTES`** the traps that belong to a source rather than to a link: the Destatis legend
  characters (`-` `.` `...` `/` `x`) that turn a numeric column into text or into zero, German
  decimal commas and Latin-1, the Wegweiser Kommune projections that run to 2040 and look like
  measurements, the census being one reference date rather than a series.
- **`TEMPLATES`** the blocks in the palette. The SOEP ones follow SOEP-Core v41 exactly, which is
  the single most useful thing in here: the person and household files carry **no area code**, and
  `regionl` is what turns a household and a survey year into a place. It has `kkz`, and it also has
  **`kkz_rek`, recoded to the boundaries of 31.12.2023**, which is the right answer to the reform
  problem and is on the same reference date as INKAR and the BBSR reference system. The guided flow
  inserts that bridge by itself, because nobody arriving here for the first time can know it exists.

## Every check ends in a button

A check that only names the defect asks the reader for exactly the knowledge they came here
without. So each one carries an action, and there are two kinds, deliberately styled apart:

- **A fix** (solid button) changes the canvas and the generated code: insert the crosswalk a
  postcode-to-district link needs, switch to the boundary-recoded key, add the aggregation step,
  keep only the largest share of a weighted crosswalk, cut the period to the overlap, take the
  nearest year, add SOEPregion and link it, draw the best missing key pair. Safe to press.
- **A pointer** (outline button) makes no change, because the call is the reader's: it scrolls to
  and flashes the palette group, the block, the link, or the exact line in the generated script.
  "No analysis table" cannot be fixed for you, since only you know whether your rows are people
  or households; it can show you where the three blocks are.

Actions live in `applyAction()` as a small verb registry (`bridge`, `years`, `time`, `rek`,
`aggregate`, `largest`, `level`, `addRegionl`, `pair`, and the pointers `showPalette`, `showNode`,
`showEdge`, `showCode`, `open`). Pointers return before `render()`, otherwise the re-render wipes
the highlight they just set. When adding a check, give it one of these; an `ok` check needs none.

## Both directions to the finder

Every result in the GeoDB finder carries "Plan a linkage with this indicator", which opens this
page with that record already chosen (`?q=`, consumed and stripped on load). Every regional block
here carries "Look this up in the GeoDB finder", which opens the finder on the same label (the
finder reads `?q=` too). The search in between is the finder's own API, so the two never disagree
about what exists.

## The catalogue is generated, so fix the generator

`../../scripts/build_linkbuilder_catalogue.py` reads
`destatis-rag/soep_metadata_output/geodb_metadata.json` (the index behind the GeoDB finder) plus
`inkar_metadata_2025.json`, and writes `catalogue.json`. Re-run it after a GeoDB index refresh:

```bash
cd ~/kwandel/geolab_regiohub && python3 scripts/build_linkbuilder_catalogue.py
```

Two levels, because the two questions differ: **products** (236) are what you drag onto the canvas,
a table family with the levels and years its records actually cover; **items** (10,009) are the
searchable indicators, each pointing at its product. INKAR comes from its own file because the
finder indexes it separately, and it is worth the extra branch: it is the source most often
attached to survey data and the only one with a year range **per spatial level**.

Corrections belong in `SOURCE_FIXES`-style dicts inside that script (`SCHLUESSEL_HINWEISE`,
`QUELLEN_NOTIZ`), never in the JSON. Same rule as the finder repo: an edit to a generated file has
a half-life of one run.

## One downloaded table has one regional depth

The catalogue lists every level a product's tables use, which is a union over many tables. A block
that offered all of them as keys at once claimed something false and produced three columns with
the same name in the generated code. So a regional block carries **one** geo key, defaulting to the
finest level, switchable in the inspector, and changing it releases any link that hung on the old
key. Do not undo that.

## The canvas, after the first round of feedback (2026-09-10)

Three things Konstantin asked for after using it, all because the first version made the reader
work out what the picture meant:

- **A line between two boxes only shows THAT something is connected.** Every key row now carries
  its partner in the row itself (`kkz_rek → schluessel`), the connected rows are tinted on both
  sides, and the connection points sit on the edges of the box so a wire visibly starts at the row
  it belongs to. The tooltip names the partner table as well.
- **A box is dragged from anywhere**, not only its header. Ports and the close button are excluded,
  and a three-pixel threshold keeps a click from counting as a move.
- **Which columns are worth connecting is now on the block.** Area codes (circle) and dates
  (diamond) are what link different sources; a case number (square, muted) only links tables from
  the same study. There is a legend on the canvas saying exactly that, and `regionl`'s `kkz_rek`
  carries a *best choice* mark, because picking `kkz` instead is the mistake this whole tool exists
  to prevent.
- Both side panels are resizable by dragging the divider (or with the arrow keys when it has
  focus); the widths are remembered per browser.

## Any block can be the analysis table

There is exactly one analysis table and its rows are the rows of the result, but which block
holds that role is not fixed by what the block is. `regionl` is one row per household and survey
year, so it is a perfectly good thing to analyse; the same goes for a regional table if districts
are your unit. Every non-base block therefore carries **Use this as my analysis table** in its
panel, and the "No analysis table" check offers it directly when exactly one candidate is on the
canvas. Promotion demotes the previous base back to `origKind`.

## Things that were got wrong once and should not be got wrong again

- **A transformed `<svg>` root clips at its default 300 × 150.** The wires were stubs until the
  pan/zoom transform moved to a `<g>` inside an SVG that fills the canvas.
- **The native R pipe belongs at the end of a line.** `dat <- x` followed by a line starting `|>`
  parses as two expressions and silently yields the unjoined table. Same class: a trailing comment
  on a line that later gets ` |>` appended comments the pipe out. Every generated script is now
  checked with `Rscript -e "parse(...)"` across six scenarios.
- **In Stata, rename the *using* side, not the master.** Renaming the master's key for one merge
  removes the column the next merge needs. The generated do-file renames each using file's keys to
  the analysis table's names before `save`.
- **A weighted crosswalk is deliberately not unique**, so the uniqueness assertion and `merge m:1`
  have to be skipped there (`joinby` instead), and the script has to say how to collapse back.
- **Visiting order decides what reaches the script.** A bridge inserted between two blocks must be
  walked *before* the block it feeds, otherwise its key never reaches it and the linkage silently
  degrades to a year-only join. Bridges are therefore visited first.
- **A hit target of eleven pixels is not a hit target.** Making the whole box draggable turned a
  near-miss on a port dot into a box move, and the drop test also required the dot exactly, so a
  line could be started and not finished. That is what "the links don't link" looked like. The
  whole key row is now the handle at both ends, and the row highlights while you drag over it.
- **`user-select` on the node was not enough.** Dragging still painted the rest of the page blue,
  and in browsers that then start a native drag it swallows the pointer events. The app shell is
  `user-select: none` with the readable blocks opted back in, and node pointerdown calls
  `preventDefault()`.
- **`content: url(...)` on an `<img>` is a fragile way to swap a themed image.** In the dark theme
  it rendered the broken-image glyph plus the alt text. Two `<img>` elements and a display toggle
  cannot fail that way.
- **`--rule-strong` is light in the dark theme.** Using it as a header background gave white
  subtitle text on a light-blue bar. The analysis block's header has its own tokens now.

## How to check it after a change

There is no test runner; it is a page, so it gets driven like one. The scripts in the session
scratchpad (`lb.py`, `lbcode.py`, `lbgps.py`) open it in Chromium with a drawn cursor, click through
the guide, drag a link port to port, and dump the generated code for six scenarios, which is then
run through R's parser. Reproduce that rather than trusting a screenshot: every real bug in this
file's list was invisible until the page was actually operated.

## Open

- The catalogue's spatial levels come from the GeoDB index and are only as good as it is. Some
  products list a level that only some of their tables have.
- No crosswalk file ships with the tool. The bridge blocks name what is needed and where to get it;
  for postcodes there is no official free correspondence table from the statistical offices, and the
  page says so rather than pretending otherwise.
- Nothing here is linked from the site yet, and no decision has been taken about whether it should
  be. That is Konstantin's call, together with Kerstin and Simon.
