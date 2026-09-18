# Build the evaluation reports.
#
#   make           both PDFs
#   make eval1     just the Evaluation 1 report
#   make watch1    rebuild on every save
#   make clean     remove build artifacts (keeps the PDFs)
#   make distclean remove build artifacts and the PDFs

LATEXMK := latexmk -pdf -interaction=nonstopmode -halt-on-error

.PHONY: all eval1 eval2 watch1 watch2 clean distclean

all: eval1 eval2

eval1:
	$(LATEXMK) eval1.tex

eval2:
	$(LATEXMK) eval2.tex

watch1:
	$(LATEXMK) -pvc eval1.tex

watch2:
	$(LATEXMK) -pvc eval2.tex

clean:
	latexmk -c eval1.tex eval2.tex

distclean:
	latexmk -C eval1.tex eval2.tex
