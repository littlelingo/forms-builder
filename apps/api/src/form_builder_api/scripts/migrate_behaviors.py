from __future__ import annotations

from form_builder_api.services.migration import migrate_all


def main() -> int:
    logs = migrate_all()
    if not logs:
        print("Migration complete: no projects found in data/projects/.")
        return 0

    migrated = sum(1 for log in logs if not log.noop)
    skipped = sum(1 for log in logs if log.noop)
    total_event_defs = sum(log.event_defs_created for log in logs)

    print(f"Migration complete: {migrated} project(s) migrated, {skipped} already up to date.")
    if total_event_defs:
        print(f"  Created {total_event_defs} event definition(s) from custom event names.")

    for log in logs:
        if log.collisions:
            print(f"  ⚠ {log.project_id}: {len(log.collisions)} collision(s) — see migration-log.json")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
