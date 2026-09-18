# Reports

LaTeX sources for both graded reports. The `.docx` files in `docs/` are the
templates we were given; these reproduce their required section structure.

## Build

```bash
make          # both PDFs
make eval1    # just Evaluation 1
make watch1   # rebuild on save
```

Needs a TeX distribution with `latexmk` and `biber`. On Debian/Ubuntu:

```bash
sudo apt install texlive-latex-recommended texlive-latex-extra latexmk biber
```

## Layout

| File | Purpose |
|---|---|
| `eval1.tex` | Evaluation 1: design report |
| `eval2.tex` | Evaluation 2: final report |
| `preamble.tex` | Shared packages, styling, title page |
| `metadata.tex` | Title, group number, member list. Edit here, not in the bodies |
| `references.bib` | Bibliography; empty until entries are cited |
| `figures/` | Figures, referenced without a path prefix |
| `figures/bits-logo.png` | Institute logo, extracted from the `.docx` templates |

## Placeholders

Unwritten content is marked with `\stub{...}`, which renders as a visible red
box so an unfinished section is obvious on the page. `\note{...}` is a lighter
inline marker for a single value still to be filled in.

Delete each one as you write the prose that replaces it. When none are left, the
report is finished.

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

Sections 1–3 of Evaluation 2 carry over from Evaluation 1, revised to match what
was actually built.

## Source material

Each section header in the `.tex` files names the design doc it draws on, so the
prose gets written from an existing decision rather than a blank page.
