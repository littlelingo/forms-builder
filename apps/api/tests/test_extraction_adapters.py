from form_builder_api.models.canonical import Coordinates
from form_builder_api.services.extraction_adapters import (
    ExtractedTextLine,
    _cluster_button_widgets,
    _prefer_page_reference,
    _resolve_button_group,
)


def test_prefer_page_reference_uses_embedded_page_marker():
    assert _prefer_page_reference("F[0] P4[0] Birth Sex[0]", 1) == 4


def test_prefer_page_reference_falls_back_without_marker():
    assert _prefer_page_reference("applicantName", 2) == 2


def test_cluster_button_widgets_splits_generic_button_rows():
    widgets = [
        {"bounds": Coordinates(page=5, x=246, y=92, width=10, height=10)},
        {"bounds": Coordinates(page=5, x=270, y=92, width=10, height=10)},
        {"bounds": Coordinates(page=5, x=246, y=156, width=10, height=10)},
        {"bounds": Coordinates(page=5, x=270, y=156, width=10, height=10)},
    ]

    clusters = _cluster_button_widgets("F[0].P5[0].RadioButtonList", widgets)

    assert len(clusters) == 2
    assert len(clusters[0]) == 2
    assert len(clusters[1]) == 2


def test_resolve_button_group_uses_binary_prompt_line_and_yes_no_options():
    page_lines = [
        ExtractedTextLine(
            page_number=4,
            text="A. ARE YOU A PURPLE HEART AWARD RECIPIENT?",
            confidence=0.8,
            bounds=Coordinates(page=4, x=30, y=667, width=210, height=12),
        ),
        ExtractedTextLine(
            page_number=4,
            text="YES",
            confidence=0.8,
            bounds=Coordinates(page=4, x=275, y=649, width=22, height=10),
        ),
        ExtractedTextLine(
            page_number=4,
            text="NO",
            confidence=0.8,
            bounds=Coordinates(page=4, x=301, y=649, width=18, height=10),
        ),
    ]
    widgets = [
        {"name": "F[0].P4[0].Section2_2A", "bounds": Coordinates(page=4, x=277, y=667, width=10, height=10)},
        {"name": "F[0].P4[0].Section2_2A", "bounds": Coordinates(page=4, x=303, y=667, width=10, height=10)},
    ]

    label, help_text, semantic_type, options, label_source, label_bounds = _resolve_button_group(
        name="F[0].P4[0].Section2_2A",
        widgets=widgets,
        page_lines=page_lines,
        fallback_options=[],
    )

    assert label == "A. ARE YOU A PURPLE HEART AWARD RECIPIENT?"
    assert help_text is None
    assert semantic_type.value == "radio"
    assert options == ["YES", "NO"]
    assert label_source == "layout"
    assert label_bounds is not None


def test_resolve_button_group_prefers_anchor_line_over_nearer_continuation():
    page_lines = [
        ExtractedTextLine(
            page_number=5,
            text="A. DID YOU SERVE IN AN IONIZING RADIATION LOCATION",
            confidence=0.8,
            bounds=Coordinates(page=5, x=30, y=80, width=220, height=12),
        ),
        ExtractedTextLine(
            page_number=5,
            text="AND PARTICIPATE IN ANY NUCLEAR TESTING,",
            confidence=0.8,
            bounds=Coordinates(page=5, x=39, y=88, width=210, height=12),
        ),
        ExtractedTextLine(
            page_number=5,
            text="TREATMENTS, OR CLEAN UP?",
            confidence=0.8,
            bounds=Coordinates(page=5, x=39, y=96, width=160, height=12),
        ),
        ExtractedTextLine(
            page_number=5,
            text="YES",
            confidence=0.8,
            bounds=Coordinates(page=5, x=245, y=112, width=22, height=10),
        ),
        ExtractedTextLine(
            page_number=5,
            text="NO",
            confidence=0.8,
            bounds=Coordinates(page=5, x=271, y=112, width=18, height=10),
        ),
    ]
    widgets = [
        {"name": "F[0].P5[0].RadioButtonList", "bounds": Coordinates(page=5, x=247, y=112, width=10, height=10)},
        {"name": "F[0].P5[0].RadioButtonList", "bounds": Coordinates(page=5, x=273, y=112, width=10, height=10)},
    ]

    label, _help_text, _semantic_type, options, _label_source, _label_bounds = _resolve_button_group(
        name="F[0].P5[0].RadioButtonList",
        widgets=widgets,
        page_lines=page_lines,
        fallback_options=[],
    )

    assert label.startswith("A. DID YOU SERVE IN AN IONIZING RADIATION LOCATION")
    assert "TREATMENTS, OR CLEAN UP?" in label
    assert options == ["YES", "NO"]


def test_resolve_button_group_defaults_generic_two_widget_cluster_to_yes_no():
    page_lines = [
        ExtractedTextLine(
            page_number=5,
            text="C. DID YOU SERVE IN A COMBAT THEATER OF OPERATIONS AFTER",
            confidence=0.8,
            bounds=Coordinates(page=5, x=30, y=272, width=240, height=12),
        ),
        ExtractedTextLine(
            page_number=5,
            text="11/11/1998?",
            confidence=0.8,
            bounds=Coordinates(page=5, x=39, y=284, width=70, height=12),
        ),
        ExtractedTextLine(
            page_number=5,
            text="ASBESTOS",
            confidence=0.8,
            bounds=Coordinates(page=5, x=310, y=301, width=56, height=12),
        ),
    ]
    widgets = [
        {"name": "F[0].P5[0].RadioButtonList", "bounds": Coordinates(page=5, x=247, y=313, width=10, height=10)},
        {"name": "F[0].P5[0].RadioButtonList", "bounds": Coordinates(page=5, x=273, y=313, width=10, height=10)},
    ]

    label, _help_text, _semantic_type, options, _label_source, _label_bounds = _resolve_button_group(
        name="F[0].P5[0].RadioButtonList",
        widgets=widgets,
        page_lines=page_lines,
        fallback_options=["WARFARE AGENTS (nerve agents, chemical and biological weapons)"],
    )

    assert label.startswith("C. DID YOU SERVE IN A COMBAT THEATER OF OPERATIONS AFTER")
    assert options == ["YES", "NO"]


def test_resolve_button_group_prefers_prompt_anchor_above_widget_over_later_row():
    page_lines = [
        ExtractedTextLine(
            page_number=5,
            text="2E. WAS CHILD PERMANENTLY AND TOTALLY DISABLED BEFORE THE",
            confidence=0.8,
            bounds=Coordinates(page=5, x=312, y=620, width=220, height=12),
        ),
        ExtractedTextLine(
            page_number=5,
            text="AGE OF 18?",
            confidence=0.8,
            bounds=Coordinates(page=5, x=324, y=627, width=70, height=12),
        ),
        ExtractedTextLine(
            page_number=5,
            text="2F. IF CHILD IS BETWEEN 18 AND 23 YEARS OF AGE, DID CHILD ATTEND",
            confidence=0.8,
            bounds=Coordinates(page=5, x=312, y=656, width=250, height=12),
        ),
        ExtractedTextLine(
            page_number=5,
            text="SCHOOL LAST CALENDAR YEAR?",
            confidence=0.8,
            bounds=Coordinates(page=5, x=324, y=663, width=140, height=12),
        ),
        ExtractedTextLine(
            page_number=5,
            text="YES",
            confidence=0.8,
            bounds=Coordinates(page=5, x=330, y=637, width=22, height=10),
        ),
        ExtractedTextLine(
            page_number=5,
            text="NO",
            confidence=0.8,
            bounds=Coordinates(page=5, x=376, y=637, width=18, height=10),
        ),
    ]
    widgets = [
        {"name": "F[0].P5[0].RadioButtonList", "bounds": Coordinates(page=5, x=331, y=637, width=10, height=10)},
        {"name": "F[0].P5[0].RadioButtonList", "bounds": Coordinates(page=5, x=377, y=637, width=10, height=10)},
    ]

    label, _help_text, _semantic_type, options, _label_source, _label_bounds = _resolve_button_group(
        name="F[0].P5[0].RadioButtonList",
        widgets=widgets,
        page_lines=page_lines,
        fallback_options=[],
    )

    assert label.startswith("2E. WAS CHILD PERMANENTLY AND TOTALLY DISABLED")
    assert "SCHOOL LAST CALENDAR YEAR" not in label
    assert options == ["YES", "NO"]
