#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from collections import Counter
from dataclasses import asdict
from pathlib import Path

from form_builder_api.services.corpus_validation import (
    SMOKE_SAMPLE_NAMES,
    collect_form_sample_pdfs,
    extract_sample_validation_metrics,
    resolve_form_samples_dir,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a repeatable extraction validation sweep over a local PDF corpus.",
    )
    parser.add_argument(
        "--corpus-dir",
        help="Directory containing sample PDFs. Defaults to /Users/clint/Workspace/va/form-samples when available.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Only validate the first N PDFs after sorting by filename.",
    )
    parser.add_argument(
        "--smoke-set",
        action="store_true",
        help="Run only the representative smoke set instead of the full directory.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit the report as JSON.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    corpus_dir = resolve_form_samples_dir(args.corpus_dir)
    if corpus_dir is None:
        print("Corpus directory not found. Pass --corpus-dir or make /Users/clint/Workspace/va/form-samples available.")
        return 1

    pdf_paths = collect_form_sample_pdfs(
        corpus_dir,
        names=SMOKE_SAMPLE_NAMES if args.smoke_set else None,
        limit=args.limit,
    )
    if not pdf_paths:
        print(f"No PDFs found in {corpus_dir}.")
        return 1

    metrics = [extract_sample_validation_metrics(path) for path in pdf_paths]
    counts = Counter(metric.document_class for metric in metrics)
    suspicious = [
        {
            "filename": metric.filename,
            "reasons": [
                *(
                    ["no interactive fields on fillable document"]
                    if metric.document_class == "xfa_backed_fillable" and metric.interactive_field_count == 0
                    else []
                ),
                *(["machine labels still visible"] if metric.machine_label_count > 0 else []),
                *(
                    ["no groups extracted"]
                    if metric.group_count == 0 and (metric.interactive_field_count == 0 or metric.field_count >= 20)
                    else []
                ),
                *(["no fields extracted"] if metric.field_count == 0 else []),
            ],
        }
        for metric in metrics
        if (
            (metric.document_class == "xfa_backed_fillable" and metric.interactive_field_count == 0)
            or metric.machine_label_count > 0
            or (metric.group_count == 0 and (metric.interactive_field_count == 0 or metric.field_count >= 20))
            or metric.field_count == 0
        )
    ]

    report = {
        "corpus_dir": str(corpus_dir),
        "pdf_count": len(metrics),
        "document_class_counts": dict(counts),
        "suspicious_count": len(suspicious),
        "suspicious": suspicious,
        "samples": [asdict(metric) for metric in metrics],
    }

    if args.json:
        print(json.dumps(report, indent=2))
        return 0

    print(f"Corpus: {corpus_dir}")
    print(f"Validated PDFs: {len(metrics)}")
    print("Document classes:")
    for document_class, count in sorted(counts.items()):
        print(f"  - {document_class}: {count}")
    if suspicious:
        print("Suspicious samples:")
        for item in suspicious:
            print(f"  - {item['filename']}: {', '.join(item['reasons'])}")
    else:
        print("Suspicious samples: none")

    print("Per-file summary:")
    for metric in metrics:
        print(
            "  - "
            f"{metric.filename}: class={metric.document_class}, pages={metric.page_count}, "
            f"fields={metric.field_count}, interactive={metric.interactive_field_count}, "
            f"groups={metric.group_count}, issues={metric.issue_count}, "
            f"promptValue={metric.prompt_value_group_count}, matrix={metric.matrix_group_count}, "
            f"machine={metric.machine_label_count}, avgConfidence={metric.average_confidence:.3f}"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
