# PresDes project archive

Project materials preserved from the HackUMass XIV workspace on November 18, 2026.
These are historical records and drafts, not current repository instructions or a guarantee of the current app behavior. Read the [main README](../../README.md) for setup and current features.

## Contents

- [Planning and review](planning/): the original code review, implementation plan, and mobile scan-page plan.
- [Devpost](devpost/): earlier and revised submission drafts, public-page screenshots, and submission confirmation.
- [Presentation](presentation/): editable PowerPoint with speaker notes, a short fictional-label demo recording, and the results screenshot.
- [LinkedIn](linkedin/): post and comment drafts, image descriptions, and screenshots.
- [Scan UI](scan-ui/): design-preview screenshots, accessibility display settings, and an analysis animation recording.
- [Earlier screenshots](screenshots/): previous versions of the interface.
- [Fictional scan result](verification/fictional-scan-result.json): saved verification output for the Pine Sample training label.
- [File manifest](manifest.json): original relative filenames, archive locations, and SHA-256 hashes.

Some screenshots show features or layouts that were later changed or removed. The scan UI animation preview uses a controlled delay and fictional output; it does not measure provider latency. The original review describes an older commit and its findings should not be assumed to remain open. Local machine paths in the copied plans were normalized; the original local files remain untouched.

## Presentation attribution

The deck retains its source citations and speaker notes. Its introductory bottle photograph is credited to the Walmart Equate Ibuprofen listing, and the prescription-label study is credited to Davis et al., *Annals of Internal Medicine* (2006). Third-party material retains its original ownership.

## Deliberately kept private or excluded

API keys, database connection strings, signing secrets, demo passwords, `.env` files, account-setup/DNS administration screenshots, and private saved scans are not included. Keep any needed configuration in a separate private backup before deleting local files. The archive does not replace a MongoDB database backup.

Installed dependencies, virtual environments, duplicate Git checkouts, build outputs, and the archived dependency-filled review checkout are also excluded. Source code is preserved by the repository history, and dependencies can be installed using the setup instructions.
