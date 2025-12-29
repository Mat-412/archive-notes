# Changelog

All notable changes to **Archive Notes** will be documented in this file.

## [1.0.2] - 2025-12-28
- Quickly created notes are now properly saved when closing the app
- When deleting the parent of a note it now leaves the note completely, showing the "note not selected" screen
- When recovering the parent of a note it now stays on that note when it leaves the trash can
- When recovering a note it now keeps the same open/closed state it had in the trash can
- Window icon in the top-left corner is now crisp and clear at all display scaling levels
- Plus button in the sidebar is now larger and better centered
- Imported notes now appear at the top of the sidebar in their original order from the imported file
- Sidebar can now be resized slightly wider (increased max width by 5px)

## [1.0.1] - 2025-12-20
- Added an in-app "What's New" screen (Help → What's New) and it auto-opens once after updating.
- Added in-app update notifications (checks on launch; prompts to download/install when an update is available).
- About dialog header now shows "(Free Edition)".
- Updated the About dialog description text.
- Windows installer artifact name now includes `-free-` (`ArchiveNotes-free-Setup-1.0.1.exe`).
- Dependency updates: `electron` → 39.2.7, `dompurify` → 3.3.1.

## [1.0.0] - 2025-12-12
- Initial public release (Free Edition: personal, non-commercial use).