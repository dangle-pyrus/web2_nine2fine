# Project Context

Read `document/nine2fine_MASTER_PLAN.md`, especially sections 0 and 56-59, before implementing a feature. Inspect the actual code and latest ledger; do not infer completion from the roadmap.

- Angular 22 standalone frontend, strict TypeScript, SCSS, Signals/RxJS and typed mock/HTTP interfaces.
- Preserve user changes and original assets. Do not re-scaffold the app.
- Reicon is integrated through `@ng-icons/core` + `@ng-icons/reicon`; the inspected `reicon-angular@1.0.1` publication was unusable.
- unDraw sources in `svg/` are optional illustrations. Publish only selected files through `angular.json`.
- Pexels API is not configured. Use the media manifest for temporary assets and never put secrets in client code or logs.
- Figma is read through the local `open-figma-mcp` plugin (Figma Desktop must run the plugin); exports must be written inside the workspace (`.open-figma-mcp/exports/`). Tokens and onboarding frames are audited; other frames are not. Do not claim pixel parity. Preserve auth/account visual design.
- Keep work scoped to a feature or cohesive system. Update the master-plan ledger with files changed, actual verification results, limitations and next work.
- Run applicable lint/build/E2E checks. A local Angular dev server may already run on port 4200; reuse it after verifying it belongs to this project.
