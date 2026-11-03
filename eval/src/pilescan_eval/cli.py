from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="pilescan-eval")
    sub = ap.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("run", help="run photos through inference and/or the public API, store raw outputs")
    r.add_argument("--label", required=True, help="output folder name under eval/out/, e.g. before-stub")
    r.add_argument("--inference-url", default=None, help="e.g. http://localhost:8100 (omit to skip)")
    r.add_argument("--api-url", default=None, help="e.g. http://localhost:4200 (omit to skip)")
    r.add_argument("--sets", nargs="+", default=["real", "synthetic"], choices=["real", "synthetic"])
    r.add_argument("--only", nargs="*", help="restrict to these file names")
    r.add_argument("--sha", default=None, help="commit of the code under test (default: current HEAD)")
    r.add_argument("--note", default="", help="free text stored in run.json (e.g. classifier, commit)")

    m = sub.add_parser("report", help="recompute metrics from saved outputs (no network)")
    m.add_argument("labels", nargs="+", help="labels under eval/out/ (several = side-by-side)")
    m.add_argument("--only", nargs="*", help="restrict to these file names (e.g. the photos a limited run covers)")
    m.add_argument("--out", default=None, help="write markdown to this path (default: stdout)")

    n = sub.add_parser("annotate", help="write annotated thumbnails (<=480 px) with detection boxes")
    n.add_argument("label")
    n.add_argument("images", nargs="+", help="file names from fixtures/real")
    n.add_argument("--out-dir", default=None, help="default docs/eval/img (git-ignored)")
    n.add_argument("--suffix", default=None, help="file suffix, default = label")

    a = ap.parse_args(argv)
    if a.cmd == "run":
        from .run import run

        run(a.label, a.inference_url, a.api_url, a.sets, a.only, a.note, a.sha)
    elif a.cmd == "annotate":
        from .annotate import annotate

        annotate(a.label, a.images, a.out_dir, a.suffix)
    else:
        from .report import report

        md = report(a.labels, a.only)
        if a.out:
            Path(a.out).write_text(md)
            print(f"wrote {a.out}")
        else:
            print(md)
    return 0


if __name__ == "__main__":
    sys.exit(main())
