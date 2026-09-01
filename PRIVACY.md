# Privacy

Book Library is local-first. It does not include telemetry, analytics, crash reporting or account creation.

## Stored locally

- Plugin settings and API keys stay in Obsidian plugin data on your device.
- Catalog notes, indexes and generated Markdown stay in your vault.
- Media files remain at their original location; scanning reads metadata but does not move or upload media.

## Optional network access

- **Metadata/covers:** when enabled, title, author or ISBN may be sent to Open Library and Google Books.
- **AI wiki:** selected text chunks plus up to six locally approved catalog targets and their match reasons may be sent to the configured provider (Codex CLI, Claude CLI, OpenCode, OpenRouter or a local command).
- **AI covers:** title, author and category hints may be sent to OpenAI when you explicitly start a batch.
- **Source links:** opening an external link follows the destination's privacy policy.

No optional network call happens until you run the matching action. Disable metadata fetching or leave providers off for a fully offline workflow.

## Secrets

API keys are stored only in local Obsidian plugin settings and sent only to the configured provider. Do not commit vault indexes containing private URLs.
