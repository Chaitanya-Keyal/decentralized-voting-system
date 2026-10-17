# Build the evaluation reports.
#
#   make           the Evaluation 2 report
#   make watch2    rebuild on every save
#   make clean     remove build artifacts (keeps the PDF)
#   make distclean remove build artifacts and the PDF
#
# Evaluation 1 has been submitted. Its PDF and slides live in submitted/ as a
# read-only record and are never rebuilt; the eval1 sources are kept only for
# reference.

LATEXMK := latexmk -pdf -interaction=nonstopmode -halt-on-error

.PHONY: all eval2 watch2 clean distclean

all: eval2

eval2:
	$(LATEXMK) eval2.tex

watch2:
	$(LATEXMK) -pvc eval2.tex

clean:
	latexmk -c eval2.tex

distclean:
	latexmk -C eval2.tex
