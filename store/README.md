# App Store pack for Galactic Outbreak

Everything App Store Connect asks for, ready to paste. Start with `RELEASE.md`: it is the checklist from "no Apple account" to "submitted for review".

| File | What it is | Apple's limit |
| --- | --- | --- |
| `RELEASE.md` | The numbered checklist, with where to click and what to paste | |
| `listing/name.txt` | App name | 30 characters |
| `listing/subtitle.txt` | Subtitle | 30 characters |
| `listing/promotional-text.txt` | Promotional text (can change without a new build) | 170 characters |
| `listing/description.txt` | Description | 4000 characters |
| `listing/keywords.txt` | Keywords, comma separated, no spaces | 100 characters |
| `listing/whats-new.txt` | What's New in This Version | 4000 characters |
| `listing/support-url.txt` | Support URL | |
| `listing/marketing-url.txt` | Marketing URL | |
| `listing/privacy-policy-url.txt` | Privacy Policy URL | |
| `listing/review-notes.txt` | Notes for App Review | 4000 characters |
| `categories.md` | Primary and secondary category | |
| `age-rating.md` | Age rating questionnaire answers, with reasons | |
| `app-privacy.md` | App Privacy ("nutrition label") answers | |
| `export-compliance.md` | Encryption question | |
| `icon/app-icon-1024.png` | The 1024 px icon (made by `npm run icons`) | 1024 x 1024, no transparency |
| `screenshots/` | iPhone screenshots (made by `npm run store:screenshots`) | 6.9 inch 1320 x 2868, 6.5 inch 1284 x 2778 |

The limits are checked by `tests/appstore-listing.test.js`, so `npm test` fails if an edit runs over.

Single source of truth:

- App name and bundle id: `capacitor.config.json` (`appName`, `appId`). The Xcode project and the web manifest are tested against it.
- Version: `package.json` `version`. The Xcode project's `MARKETING_VERSION` is tested against it. The build number is set by the release workflow.
- Ad pacing: `src/monetization/ad-policy.js`. Ad ids and the tracking choice: `src/config/ads.js`.

## Redoing the art

```
npm run icons               # icon, web icons, launch screen
npm run build && npx vite preview --port 4320 --strictPort &
npm run store:screenshots   # needs Playwright and a running preview, see the script header
```
