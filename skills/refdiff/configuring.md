# Configuring a pair — `disabled`, `ignore`, and the library's shape

Read this when you DECLARE a pair, or when you are about to write policy for one. Everything
here is durable manifest state: a judgement made once instead of re-made every run.

**Two standing constraints from `SKILL.md`, because this is the file where they get broken.**
Rule 5: suppression is visible or it does not happen — nothing here deletes a finding, every
suppressed one travels in `findings.json` under `suppressed` tagged with the rule that hit it.
And policy is a POLISH tool: on a `reconcile` pair the noise is structural, so suppressing it
hides the thing you came to reconcile (`reconcile.md` §R5 — `ignore.scope` is the one
exception, because it fixes the alignment rather than hiding a finding).

## Turning a pair OFF — `disabled`

`disabled: "<why>"` keeps a pair in the manifest and runs nothing. The case it
exists for: a comp is superseded by a rebuild, so its pair now measures the new
surface against the old design and reports hundreds of findings that mean
nothing. Deleting the pair loses the declaration and the comp's linkage;
leaving it enabled trains everyone to read its number as weather.

```js
{
  id: "refdiff-library-desktop",
  disabled: "RefDiff Library.dc.html draws the card grid chunk 5 replaced — 489 findings at confidence 0.14",
  design: { file: "RefDiff Library.dc.html", frame: "Library" },
  app: { source: "live", route: "/", viewport: { width: 1180, height: 800 } },
}
```

**The reason is REQUIRED and `disabled: true` is refused**, naming the entry: a
pair that silently does not run is the one failure that reports itself nowhere,
so the single thing a disabled pair must carry is why. Re-enabling is deleting
one key.

- It lands in `ManifestParse.skipped`, so `compare` prints
  `skipping <id>: disabled — <reason>` on **every** run. Naming only disabled
  ids in `--pair` exits 2 with "no runnable pairs selected", after those lines.
- **Its run dir is left exactly as it was.** Nothing is deleted, so the
  annotator still lists the last result it had — a disabled pair's card is a
  frozen measurement, not a missing one.
- It is read BEFORE the design and impl specs are validated, so a disabled pair
  whose spec has rotted does not fail the whole manifest. The cost: a typo
  inside a disabled entry waits until it is re-enabled.
- **A coverage guard must treat it as a third state.** A disabled pair satisfies
  "the design is declared" while failing "the pair is measured", and keeping
  those two facts apart is what such a guard is for — counting it as paired puts
  a silent hole in the check written to close one. This repo's
  `pairCoverage` reports it under `unmeasured`, asserted EXACTLY against a
  `DISABLED_COMPS` list rather than with `contains`, because an empty list is
  indistinguishable from a clean tree.

## Configuring a pair — the `ignore` block

Every pair in a manifest may carry an `ignore` block. It is the durable place
for a judgement you have already made; making it once beats re-judging the same
findings every run. **Nothing here deletes a finding** — suppressed findings
travel in `findings.json` under `suppressed`, tagged with the rule that hit
them, so a wrong policy is auditable rather than invisible. A `textPatterns`
regex is tested against the finding's `text` IN FULL, then the strings quoted
in its message and the `expected` / `actual` text — so an anchored `^…$`
pattern can excuse a long label; if a rule "does not fire", print those
strings for the finding before touching the regex (display strings are not
data strings).

```js
{
  id: "docs-owner-desktop",
  section: "Core patterns/Documents",                     // where it belongs — see "Declaring the library's shape"
  design: { file: "documents.dc.html", frame: "8a" },
  app: { source: "live", role: "owner", route: "/…/docs", viewport: { width: 1280, height: 900 } },
  ignore: {
    scope: "[data-testid=doc-list]",                      // compare this design node, not the artboard
    dataSlots: { patterns: ["\\d{1,2}\\. \\d{1,2}\\. \\d{4}"] },
    roles: ["backdrop"],
    accepted: [{ type: "color", expected: { color: "rgb(26,26,26)" }, actual: { color: "rgb(44,36,25)" }, reason: "…" }],
    contentsOf: [{ role: "image", types: ["missing-element"], reason: "the app draws the run's screenshot where the comp imports live DOM" }],
    explain: [{ types: ["position", "spacing"], region: { x: 1039, y: 86, w: 321, h: 2000 }, cause: "comp rail row order", reason: "the comp's demo lists its rows in another order — design ask 1" }],
  },
}
```

Pick the narrowest tool that covers the case:

| you want to ignore | use | what it costs you |
| --- | --- | --- |
| a volatile VALUE (amount, date, id, name) while still checking the copy around it | `dataSlots: { patterns }` | nothing else — geometry, colour, typography still compared on that pair |
| every text difference on matched pairs (a deliberately data-only comparison) | `dataSlots: true` | blind to ALL copy drift; it cannot expire, so it hides tomorrow's regression too |
| an element entirely — geometry, colour and text alike | `textPatterns` | every finding type about a matching string, geometry included; reach for it last |
| a kind of element (backdrops, focus rings, an SVG overlay's `shape`s) | `roles` | that role everywhere in the pair |
| artboard chrome (labels, notes around the frame) | `regions` or `scope` | prefer `scope`: it fixes the ALIGNMENT too, which `regions` does not |
| a class of findings whose CAUSE you have diagnosed and cannot fix from here (the comp's demo order, a canvas-zoom difference, a numbering scheme) | `explain: [{ types, region \| within: { role }, text?, cause, reason }]` — the finding stays in `findings` with its severity, carries `explained: { cause, rule }`, is grouped under the cause in the run line, and is left OUT of the verdict | `types` is required and is the safety: name only what the cause can physically produce, so a `color`/`typography`/`text-content` finding in the same region still fails. It does NOT lapse by itself — see the staleness note below |
| a specific, reviewed value difference | `accepted: [{ type, expected, actual, reason }]`, by hand or via `refdiff accept` (`polish.md` §3a) — add `text` to scope it to one element when the values alone cannot | nothing — it lapses automatically when either value changes |
| the INSIDES of an accepted element (a comp's placeholder plate drawn with bars, a logo square inside an accepted image) | `contents: true` on that `accepted` rule, by hand in the manifest only (`refdiff accept` never writes it): every TEXTLESS finding whose boxes lie inside the boxes of the finding the rule hit is suppressed too, as `"<reason> (inside)"` | text inside the region is never excused (a missing label or a badge drawn over the region still shows); nothing when the rule itself hits nothing |
| the insides of an element that is THERE whether or not it is reported — the run's own screenshot where the comp draws live DOM, a canvas, a video | `contentsOf: [{ role, types, reason }]`: every TEXTLESS finding of those `types` whose boxes lie inside an impl element of that `role` is suppressed as `"<reason> (contents of <role>)"` | `types` is required — an unscoped rule would forgive its container's whole interior, including the app's own marks drawn over it. Text is never excused (the comp draws its BADGES over that region and a badge is a numeral). A container the FRAME does not contain is skipped: a panned, zoomed canvas "contains" everything beside it |

**`contentsOf` differs from `accepted … contents` in WHERE THE CONTAINER COMES FROM, and that is
the whole point.** `contents: true` takes its region from the finding its own rule HIT, so it fires
only when the container element is itself reported — for a screenshot that means only when the
screenshot fails to PAIR, which is geometry, not a decision. Measured on one corpus: the design side
had no image element at all, the app had one or two, and they still paired on five pairs of six
because a comp container sat inside the γ cutoff; the sixth had a panned canvas, so the rule fired
there and nowhere else, and among the findings it excused was the very thing that pair existed to
measure. A `contentsOf` rule names the element, so it fires every run, and its region is the
element's live box, so it follows a canvas the reader pans — which a literal `regions` box cannot do.

**An EXPLANATION is not a suppression, and it can go STALE — that is the one thing to watch.**
Suppression removes a finding from the list and says a rule hid it; an explanation leaves it there,
severity intact, and says what caused it. Reach for it when a large share of a pair is one diagnosed
cause that is not the implementation's: on one dogfooded set, 203 of 340 findings were three such
causes, and the verdict failing on them had trained everyone to read the number as weather.
An `accepted` rule lapses by itself because it is keyed to MEASURED VALUES — the moment either side
changes, it stops hitting. An `explain` rule is keyed to a region and a set of types, so it does
NOT: when the cause is finally fixed on the comp's side, the rule stays and becomes a standing
excuse over live ground. Two things watch it for you, and neither needs a maintained number:
every run compares each cause's count against the PREVIOUS run's and prints the movement (`"comp
rail row order" GREW 51 → 58 — findings joined a cause nobody re-read`, or `fell … — the cause may
be going away`), and `refdiff summary` names any declared cause that matched NOTHING anywhere in
the set, which is what a fixed cause looks like. Read those lines; they are the price of the quiet.

**A pair's `dataSlots` only started applying on 2026-09-04 — check the report,
not the manifest.** The CLI built its run-wide policy with an explicit
`dataSlots: false` whenever neither `--data-slots` nor `--data-slot-text` was
passed, and the run-wide policy merges LAST over each pair's own, so every
`ignore.dataSlots` in every manifest was overridden by a default nobody asked
for. Measured: two shipped pairs carried `{ patterns: ["Run \\d+ vs \\d+"] }` for
two days and recorded `dataSlots: false` in their reports the whole time. The
generalisation is the thing to keep: **a declared rule with no effect reports
itself nowhere** — `findings.json`'s own `policy` block is what the run actually
used, so read it there when a rule "does not fire". Same shape as a comp with no
pair, and it is why `runWidePolicy` omits a key nobody passed instead of writing
its default.

**`dataSlots: { patterns }` masks, it does not match.** Each shape is removed
from BOTH strings and the remainder compared: equal remainder = data churn
(suppressed), different remainder = copy drift (reported). So a mixed slot
works — `"Blok · 12. 7. 2026"` vs `"Doklad · 12. 7. 2026"` is reported (the
label drifted) while `"Blok · 12. 7. 2026"` vs `"Blok · 11. 7. 2026"` is not.
Anchors in the regex are optional; only the match is removed.

**Default is noisy on purpose.** Text differences on matched pairs are REPORTED
unless you say otherwise, because which strings are data is a per-pair judgement
and a harness that guesses it goes quiet about copy regressions. Read the
`text-content` findings, then declare the shapes you actually saw.

**Order of attack** — do not skip down the list:

1. **Capture** — fonts loaded? whole frame captured? soft 404? (`environment`
   findings, or every `typography` finding naming the same fallback family).
2. **Data** — make the fixture/seed render the comp's data. This is what lifts
   alignment confidence; policy cannot.
3. **Order** — on any list, grid or panel of repeated rows, compare the ORDER
   of the shared anchors on both sides before reading one finding. refdiff
   pairs row N with row N, so a different order reads as a `text-content` /
   `color` / `typography` finding on every pill, badge and chip of every row
   (one Library page: 208 → 101 findings and confidence 0.20 → 0.76 from the
   sort alone). Fix the sort or the fixture's sort key first, then re-run. If
   the order is the comp's OWN data (a demo array listed by hand) and the impl
   sorts by a real rule, it is a design gap — say so, do not bend the fixture.
4. **Alignment** — `ignore.scope`, viewport/height, using the per-axis split.
5. **Only then** the real drift, and only then write policy for what is left.

Doing 5 before 1–4 means fixing artefacts, and the delta will not stick.

## Declaring the library's shape — `section`, `sections`, `gallery`

Three OPTIONAL declarations. They change no measurement: a run with them and a
run without them produce identical reports. What they change is how a reader
navigates a manifest that has grown past a screen, and how a variant set's
cells are arranged when one is drawn as a grid.

```js
// The order and the labels of the hierarchy. Array POSITION is the order —
// there is no `order` field, so nothing can disagree with it. A path here that
// no entry uses is a PURE GROUPING NODE, deliberate and valid: hierarchy only,
// nothing measured.
export const sections = [
  "Foundations",                                          // no entries — a grouping node
  { path: "Core components / Buttons", label: "Buttons" },
  "Core patterns",
]

export const manifest = [
  {
    id: "ds-button-fill",
    section: "Core components / Buttons",                 // a flat path, never a nested tree
    design: { kind: "figma", fileKey: "…", nodeId: "…", variants: { selector: "…" } },
    app: { source: "storybook", storyId: "ds-button--fill" },
    bleed: 8,                                             // px of margin around BOTH sides' nodes,
                                                          // so a focus ring or shadow is captured
    ground: "keep",                                       // OPT-OUT. Default is "transparent":
                                                          // the paint BEHIND the node is not captured
    timezoneId: "Europe/Bratislava",                      // the zone BOTH sides render in.
    locale: "sk-SK",                                      // Default: UTC / en-US, PINNED (see below)
    // Only on a component SET — every field names a variant PROPERTY.
    gallery: {
      columns: "State",                                   // which axis is columns
      rows: "variant",
      order: { State: ["Default", "Hover", "Focus on text"] },   // pinned option order
      labels: { State: { "Focus on text": "Focus" } },           // human labels
    },
  },
]
```

- **`timezoneId` / `locale` are the capture's ZONE, and they are pinned, not
  inherited.** Every capture renders at a frozen instant (`FROZEN_CLOCK`,
  2026-09-15T12:00:00Z) so a surface showing relative time renders the same thing
  tomorrow. Until 2026-09-16 the zone that rendered that frozen instant was
  whatever the machine had, so time was reproducible and its RENDERING was not:
  the same pair on a Bratislava laptop and on a UTC CI box disagreed by two hours
  on every timestamp, with nothing in the report saying so. The default is now
  `UTC` / `en-US` for both sides of every pair — chosen because it is what an
  unconfigured Linux capture box already produced, so pinning it moved no
  existing measurement; picking a market as the default would be choosing one
  corpus's answer for every corpus.

  Set these when the COMP is drawn for a market, and set them on the ENTRY: both
  sides take the same value, and a pair that pinned one side would manufacture
  exactly the offset the pin exists to remove. There is deliberately no CLI flag
  — a run-wide override re-dates every pair in a set at once, which is a
  re-baseline wearing a flag. **Changing either value on an entry IS a
  re-baseline for that pair.**

  Two related traps the zone does not solve. **Which SIDE computes a relative
  time decides whether the frozen clock can reach it at all**: `page.clock`
  freezes what the browser reads, so a client-side "now" obeys it and a
  server-rendered one does not — a fixture whose timestamps are computed on the
  server must be anchored on a fixed date of its own. And an `ignore.textPatterns`
  rule is not a substitute for either: policy runs long after matching, so it
  hides the finding about `19 d ago` while the reflow still costs the pairing.
- **Paths are flat strings, `/`-separated, and every segment is TRIMMED.** So
  `"Actions / Button"` and `"Actions/Button"` are the same node. Without the
  trim they would be two groups rendering under one name — a split with no
  visible cause. An empty segment is refused rather than repaired (`""`,
  `"/A"`, `"A/"`, `"A//B"`), because each one is a typo whose only symptom is a
  blank row.
- **A malformed declaration FAILS the manifest.** This is the opposite call
  from an `ignore` rule, where a malformed rule is dropped and the run then
  reports everything the rule would have excused — loud. Here a dropped field
  loses a label, a position or an axis in silence and the library still draws,
  looking finished. An **unknown key in `gallery` is an error too**, and so is
  an EMPTY `gallery: {}` — that pair of checks is what turns `{ colums:
  "State" }` into a message naming the field instead of a sheet laid out on
  whatever the consumer defaults to.
- **`gallery` needs `design.variants`.** Every field of it names a variant
  property, so on a one-cell pair there is nothing for it to describe; it is
  refused, naming the entry.
- **`gallery` is a declaration, not a resolved layout — and nothing validates
  it against the SET.** The manifest parser has no Figma node, so a `columns`
  naming a property the set does not define, or an `order` listing an option no
  cell carries, is shape-valid. It travels VERBATIM into
  `<out-root>/<entryId>.set.json` (`gallery`), beside the `axes` it refers to,
  and the run prints it back — `axes from definitions, gallery columns=State
  rows=variant order pinned for State` — which is where a mismatch can be seen at
  all. The pinned properties are named rather than counted: a pin is the one
  field that OVERRIDES the axes, so a reader comparing the line against `axes
  from …` has to know which properties stopped coming from there.
  **`order` earns its keep on BOTH branches, and the `definitions` one is where
  it is easiest to skip.** The fallback's traversal order is visibly arbitrary,
  so nobody trusts it; `variantOptions` looks authoritative and is not the canvas
  order (`sets.md` §1b: 10 of 12 sets measured, every `State` axis among them). Pin any
  axis a human will read as columns.
- **An unresolvable `gallery` name is graded, and the grade is the rule.** The
  manifest parser holds no Figma node, so it can only check the SHAPE; the
  annotator's sheet holds both the declaration and the axes and is the first
  place a NAME can be checked at all. `columns` / `rows` naming a property the
  set does not define is FATAL — the sheet refuses and names the properties that
  do exist, because there is no correct grid to draw and a plausible one the
  declaration did not shape is worse than none. An `order` option no cell
  carries, or a `labels` entry for something absent, is a WARNING shown on the
  page and otherwise ignored: membership belongs to the SET, not to a
  declaration ordering it. Partial pinning is not a warning — it is the
  documented use. And with `axes.source: "child-names"` the sheet warns that its
  option order is TRAVERSAL order rather than the designer's, which `order`
  silences per property by pinning what the fallback could only guess.
- **With no `gallery` at all the sheet takes the axes' own order** — the first
  property across, the rest nested down the rows. Most sets declare nothing, so
  this is the common path; it is arbitrary but stable, and it is what `gallery`
  exists to override.
- **`section` is validated and reported, not yet persisted.** `compare` prints
  one line for a manifest that declares any (`hierarchy: 3 sections declared,
  1/2 entries placed`) and nothing for one that does not. The run root does not
  carry the section tree yet, so no surface groups by it — the annotator's
  Library still groups by the entry a pair id names (`sets.md` §1b). The consequence is
  visible: the Library comps draw a section `path` line under each set name
  (`Actions / Button`) and a hierarchy-only row with children, and the app draws
  neither, so both are reported against every Library-groups run. That is a real
  gap, deliberately left red rather than declared away.

