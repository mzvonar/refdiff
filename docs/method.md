# The method: why the model is not allowed to compare

How refdiff got to its current shape — starting from two harnesses that did
the obvious thing, why the obvious thing cannot work, and what replaced it.

Companion doc: [**Redesigning the annotator with its own
method**](self-redesign.md) — the same method turned on this repo's own UI,
with before/design/after screenshots and the numbers from every step.

---

## 1. The naive attempt

Two earlier harnesses, both mine, both built on the same assumption.

**`uctoinak-bmad/tools/design-compare`** — a redesign against a set of Claude
Design `.dc.html` comps. It rendered every comp headless, screenshotted the
matching Storybook story or live page, and composed a labelled side-by-side
PNG per pair. From its README:

> The composites in `out/compare/` are designed to be read directly: one PNG
> shows `DESIGN | IMPLEMENTATION`. An agent can `Read` each composite and
> report drift.

**`population-registry/frontend/ds/tooling/visual`** plus a split-view
annotator — same idea against Figma, with a UI on top where a designer could
drop notes on the screenshots. Notes were anchored by image-fraction
coordinates.

Both ended the run by handing the model two pictures and asking whether they
matched.

## 2. Why it was wrong

The harness part was fine. Both tools rendered the right pages, paired them
correctly, and produced clean output. The mistake was in one place, and it was
architectural: **the last step handed the judgement to the model.**

That single decision made two other things inevitable.

**Nothing was localised or measured.** The output was prose: "the button looks
a bit darker." No box, no property name, no number. There is nothing there to
fix precisely, nothing to gate on, and nothing that can be wrong in a way you
could later discover.

**Nothing was remembered.** With no measurement, there is no run-over-run
comparison, so nothing stops the model from re-breaking a region it fixed two
iterations ago — a well-documented failure mode of unbounded visual fix loops.

The population-registry annotator added one more, in the human half: notes were
anchored to image-fraction coordinates. Any recapture at a different height
slid every note off its element.

None of these are bugs to patch. They are what follows from asking a model to
be the comparator.

## 3. Why the model is the worst possible instrument here

This is not a prompt problem. It is a training-objective problem.

A vision encoder is trained so that images of the same thing land in the same
place. Semantic invariance is the *goal*: a button is a button whether it is
`#4F46E5` or `#6366F1`, at 12px radius or 6px. The encoder is explicitly
rewarded for discarding exactly the signal design QA is about. Two visually
distinct UIs can have near-identical embeddings ([Eyes Wide
Shut / MMVP](https://arxiv.org/abs/2401.06209)).

The measurements, from [`research.md`](research.md):

| what was measured | result |
| --- | --- |
| Detecting a single mutated CSS property across 4,400 screenshot pairs ([DiffSpot](https://arxiv.org/abs/2605.29615)) | best frontier model **40.7%** recall; every model below **23%** on the hard tier |
| Same benchmark, per property | `line-height` **4%**, `border-radius` **13%**, gradients ≤27% |
| Elementary geometric perception — do these boxes overlap, which is bigger ([BLINK](https://arxiv.org/abs/2404.12390), [VLMs Are Blind](https://arxiv.org/abs/2407.06581)) | **51–59%** vs ~96% human |
| Click-target grounding on GUIs ([ScreenSpot](https://arxiv.org/abs/2401.10935), [-Pro](https://arxiv.org/abs/2504.07981)) | **16.2%**, below **2%** on high-res professional UIs |

Two consequences that killed the naive design outright:

- **Recall under 41% means a "no differences found" is not evidence.** It
  means "I could not perceive one" — and that is the answer you get most of
  the time. The harness's most common output was a false pass.
- **Model-reported coordinates and measurements are noise.** Anything of the
  form "the padding looks about 8px off" is fabricated with confidence.

Two further facts close off the workarounds:

- **The image pipeline downscales screenshots** (~1456×819) before
  tokenisation. A 2px border difference may not survive into the tokens at
  all, so no amount of prompting can recover it.
- **A side-by-side composite is the worst possible format** for the question.
  Pasting two screenshots into one image measurably *hurts* a model compared
  with passing two separate images ([More Images, More
  Problems](https://arxiv.org/html/2601.07812),
  [MuirBench](https://arxiv.org/abs/2406.09411)) — and cross-image comparison
  is itself a distinct, weak skill that "resists mediation through natural
  language". Both naive harnesses produced exactly that composite, because it
  is the obvious thing to make when you believe the model is the reader.

## 4. What replaced it: invert the roles

> Deterministic code finds, localises and measures the differences. The model
> reads structured findings and writes the fix. The pass gate is
> deterministic.

The model never looks at two images and renders a verdict. Not once, in any
code path. The architecture is [GVT](https://arxiv.org/abs/1802.04732)'s
(ICSE 2018, deployed to 1,000+ designers at ~98% precision / 96% recall),
extended with a scoped pixel channel:

```
capture  → normalize → align → extract elements (both sides)
         → match elements → typed checks → policy → aggregate
         → scoped pixel diff → package for the model
```

Four things this buys that pictures never could:

**Both sides become data, not pixels.** The design side is a Figma node tree
or a Claude Design `.dc.html` DOM — real boxes, real text, real resolved
styles. The impl side is `getBoundingClientRect` + `getComputedStyle`. The
comparison is between two lists of numbers.

**Every difference is typed, localised and measured.** Not "the button looks
darker" but:

```
Primary button color mismatch — background-color #4F46E5 → #6366F1
  rect (137, 878, 273, 44) · critical
```

The model gets `expected` and `actual` as strings it can grep the codebase
for, plus a crop of that one box at native resolution if it wants to look.

**Degraded input hard-stops.** A blank render, an unhydrated canvas, a login
redirect, a soft 404 and a low-quality Figma extraction are typed
`CaptureError`s, not screenshots. There is no path from "the page was an error
screen" to "0 findings".

**The gate is a number, and it remembers.** A run is compared against the
previous run: `+N introduced / −M resolved`, with a regression ledger that
names any finding that was fixed and came back. The loop stops on the
deterministic verdict, never on the model saying it looks right.

## 5. Where the model is actually good

It is kept, deliberately, in the two places it beats deterministic code:

- **Reading findings and writing the fix.** Give it `expected`/`actual` and a
  box, and it edits the right line. This is a text task, and it is excellent
  at it.
- **Confirming on a crop, after the fact.** Native-resolution crops of one
  region, as separate images, with numbered marks — the format that lifts
  grounding from 25.7% to 86.4% ([Set-of-Mark](https://arxiv.org/abs/2310.11441)).
  It confirms; it does not decide.

The [skill](../skills/refdiff/SKILL.md) that drives the loop enforces the
order: read `findings.json` first (`expected`/`actual`), crops second, never
crops only.

## 6. Suppression is visible or it does not happen

Some differences are intended. A design that says `Pending` for a state the
product does not have is designer data, not drift. Those are excused by an
ignore policy in the manifest — but **every suppressed finding stays in
`findings.json` under `suppressed`, tagged with the rule that hit it.**

A filter that drops a finding without trace reintroduces the original problem
in a new place: "we never saw it" is precisely the outcome the tool exists to
prevent. And ignore rules must name the *content* they excuse, not a position
or a structure — a content-shaped rule stops applying when the content
changes; a structural one never expires and will hide a real regression years
later.

## 7. What stays human

Motion, hover feel, and design intent cannot be measured. They are not
guessed, and they are not silently dropped — they surface in the
[annotator](../packages/annotator) as explicit gates: a designer drops a
comment on an element, the model replies under it, the comment moves
`open → implemented → done`. Comments anchor to matched elements from the
element model, not image fractions, so a recapture re-projects them instead
of orphaning them.

## 8. The short version

| the naive harness | refdiff |
| --- | --- |
| the model is the comparator | deterministic code is the comparator; the model reads findings and writes fixes |
| the two sides are pictures | the two sides are element trees with boxes, text and resolved styles |
| output is prose | output is typed, localised, measured findings + crops |
| the verdict is an opinion | the verdict is deterministic, against a severity threshold |
| a rendered 404 passes | a rendered 404 is a typed `CaptureError` |
| no memory between runs | `+N introduced / −M resolved` + a regression ledger |
| suppression by deletion | suppression stays in the report with its rule |
| notes anchored to image fractions | comments anchored to matched elements |

Whether this actually works is not an argument — it is measured. See
[**Redesigning the annotator with its own
method**](self-redesign.md).
