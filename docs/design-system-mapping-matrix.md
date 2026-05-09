# Design System Mapping Matrix

| Canonical intent                   | USWDS target                              | Internal tooling target         | VADS reference behavior            | Custom gap | Portability notes                                        |
| ---------------------------------- | ----------------------------------------- | ------------------------------- | ---------------------------------- | ---------- | -------------------------------------------------------- |
| Text entry with validation         | `usa-input`                               | Shared text input primitive     | Standard labeled form fields       | Minimal    | Stable across runtimes                                   |
| Radio / checkbox group semantics   | `usa-radio`, `usa-checkbox`               | Shared grouped choice inspector | VADS error and hint treatment      | Moderate   | Keep options in canonical schema, not component props    |
| Dense legal or explanatory content | `usa-accordion`, `usa-summary-box`        | Review panel treatment queue    | Intro and step-page patterns       | High       | Requires project-owned flow templates                    |
| Repeatable paper rows              | Project-owned wrapper around USWDS fields | Treatment approval inspector    | Repeated subform patterns          | High       | Canonical schema should encode repeatable semantics only |
| Review before submit               | Project-owned wrapper and summary views   | Review workspace panels         | VADS review and confirmation flows | High       | Behavior belongs in runtime adapter, not schema          |
| Save in progress                   | Project-owned persistence surface         | Editor autosave and draft state | VADS save-in-progress              | High       | Keep storage contract independent from rendering         |
