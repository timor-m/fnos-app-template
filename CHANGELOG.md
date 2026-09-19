# Changelog

## Unreleased

- Add `docs/OCR_INTEGRATION.md`: OCR integration guide distilled from the health-records app, covering on-demand runtime install, worker process model, platform pitfalls, and acceptance checklist
- Disable page zooming on touch devices: viewport meta, `touch-action` pan-only, and iOS gesture/multi-touch fallbacks
- Generate GitHub Release notes from the matching version section in `CHANGELOG.md`, falling back to the built-in template summary when the section is missing
- Align the package with the official fnOS unified gateway model
- Replace the CGI port proxy with a Unix Socket Nitro launcher
- Add gateway user context helpers and package validation
- Update fnpack to 1.2.3 and document the official development workflow

## 0.1.0

- Initial open-source template release
- Nitro backend scaffold
- fnOS package generation and `.fpk` packaging
- GitHub Actions CI and Release workflows
