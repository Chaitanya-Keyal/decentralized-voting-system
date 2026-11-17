# Reports

LaTeX sources for both graded reports. The `.docx` files in `docs/` are the
templates we were given; these reproduce their required section structure.

## Build

```bash
make          # the Evaluation 2 report
make watch2   # rebuild on save
```

Evaluation 1 has been submitted. The exact files we handed in are kept in
`submitted/` as a read-only record and are never rebuilt: `make` no longer has
an `eval1` target, and the slide generator writes to `slides/build/` (ignored
by git) and refuses to write into `submitted/`.

The Evaluation 2 slides are generated, not drawn: from `reports/`, with
pptxgenjs, react, react-dom, react-icons and sharp on `NODE_PATH`, run
`node slides/build-deck-eval2.js` and copy `slides/build/eval2-slides.pptx`
here. The build stops if any figure on the slides has not been measured yet.

Needs a TeX distribution with `latexmk` and `biber`. On Debian/Ubuntu:

```bash
sudo apt install texlive-latex-recommended texlive-latex-extra latexmk biber
```

## Layout

| File | Purpose |
|---|---|
| `submitted/` | The Evaluation 1 report and slides exactly as submitted; do not edit |
| `eval1.tex` | Evaluation 1 report source, kept for reference only |
| `eval2.tex` | Evaluation 2: final report |
| `sections/eval1/` | Evaluation 1 sections, kept for reference only |
| `sections/eval2/` | One file per report section; this is where the writing happens |
| `preamble.tex` | Shared packages, styling, title page |
| `metadata.tex` | Title, group number, member list. Edit here, not in the bodies |
| `references.bib` | Bibliography, cited inline with `\cite{}` |
| `figures/` | Figures, referenced without a path prefix |
| `figures/system-model.tex` | System model diagram (TikZ) |
| `figures/lifecycle.tex` | Election lifecycle (TikZ) |
| `slides/build-deck.js` | Generator for the Evaluation 1 slides (pptxgenjs) |
| `slides/build-deck-eval2.js` | Generator for the Evaluation 2 slides; reads every number from `bench/results` and the gas snapshots |
| `eval2-slides.pptx` | The Evaluation 2 slides as last generated |
| `figures/architecture.tex`, `figures/lifecycle-final.tex` | The final architecture and lifecycle (TikZ) |
| `figures/bits-logo.png` | Institute logo, extracted from the `.docx` templates |

## Working on the report

Each section is its own file under `sections/eval2/`, so several people can write at once
without colliding. The driver `eval2.tex` only sets the title, loads the preamble and
inputs the sections in order; there is no prose in it.

Figures are TikZ source rather than images, so they stay editable and diff sensibly.

## Formatting

Matched to the `.docx` templates rather than to LaTeX defaults:

- BITS Pilani Hyderabad Campus logo centred in the header of **every** page,
  at the template's size (5.81 in wide). The PNG was extracted from the
  templates themselves, so it is the same asset.
- 0.5 in margins on all sides.
- Arial body font (Helvetica, its metric-compatible LaTeX equivalent).
- No header rule and no footer text, as in the templates. Page numbers are the
  one addition: the templates' table of contents references page numbers, so
  they need to exist.

Change any of these in `preamble.tex`.

## Section structure

Fixed by the templates. Don't reorder or rename.

**Evaluation 1**: Introduction · Domain and Problem Analysis · Requirement
Gathering · Proposed System Design · Evaluation Parameters · Implementation Plan
· Conclusion · References

**Evaluation 2**: Introduction · Domain and Problem Analysis · Requirement
Gathering · Final System Architecture · Smart Contract Design and Implementation
· Performance Analysis (Setup; Results per evaluation parameter) ·
Implementation Plan · Conclusion · References

Sections 1 to 3 of Evaluation 2 carry over from Evaluation 1, revised to match what
was actually built.

## Source material

Each section header in the `.tex` files names the design doc it draws on, so the
prose gets written from an existing decision rather than a blank page.
