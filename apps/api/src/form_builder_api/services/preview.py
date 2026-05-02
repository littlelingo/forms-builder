from __future__ import annotations

from form_builder_api.models.api import RenderPreview
from form_builder_api.models.canonical import FormDefinition


def build_render_preview(form_id: str, definition: FormDefinition) -> RenderPreview:
    steps = []
    section_count = 0
    field_count = 0

    for page in definition.pages:
        sections = len(page.sections)
        fields = sum(len(section.fields) + sum(len(group.fields) for group in section.groups) for section in page.sections)
        section_count += sections
        field_count += fields
        steps.append(
            {
                "pageId": page.id,
                "stepLabel": page.label,
                "sectionCount": sections,
                "fieldCount": fields,
            }
        )

    return RenderPreview(
        form_id=form_id,
        title=definition.title,
        document_class=definition.document_class,
        page_count=len(definition.pages),
        section_count=section_count,
        field_count=field_count,
        steps=steps,
    )
