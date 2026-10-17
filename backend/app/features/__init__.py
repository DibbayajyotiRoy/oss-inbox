"""Feature modules. Each exports FEATURE, enabled(ctx), questions(ctx), apply(ctx, verdicts) and optionally
state(ctx) -> {section title: text}. A module that owns several features also exports FEATURES (see priority_spam)."""
