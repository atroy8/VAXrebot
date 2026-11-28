# Age rating questionnaire

App Store Connect, your app, General, App Information, Age Rating, Edit.

Apple rewords this form from time to time. If a question below is missing or new, answer it from the "What the game shows" list. Answer honestly rather than aiming for a number: a wrong answer is a reason for rejection, a higher rating is not.

## What the game shows

- A sickness spreads between cartoon faces on a web of lines. A sick face is red with a spiked ring.
- People can die if the outbreak is not contained. A dead person is a grey token with a white flower, counted in a "Lost" number. No bodies, blood, suffering or sound of distress. The mentor never jokes about a death.
- The tools are public health measures: vaccinate, quarantine, test, mask, cut a contact.
- Short facts about real diseases (measles, the 2009 H1N1 flu, norovirus, pneumococcal pneumonia, MERS): how fast each spreads and how deadly it is.
- A story of hostile aliens (the Blightborne) seeding the sickness, told in six still paintings. No combat.
- No user accounts, chat, user content, web browsing, gambling, alcohol, drugs, sexual content or profanity.

## Answers

| Question | Answer | Reason |
| --- | --- | --- |
| Cartoon or Fantasy Violence | None | Nobody is attacked. Harm comes from an illness, and it is abstract. |
| Realistic Violence | None | |
| Prolonged Graphic or Sadistic Realistic Violence | None | |
| Profanity or Crude Humor | None | |
| Mature or Suggestive Themes | Infrequent or Mild | Death from disease is part of the game, shown gently. This is the honest answer for "themes a young child may need explained". |
| Horror or Fear Themes | None | The tone is warm and hopeful. If Apple's wording asks about "themes that may frighten young children", choose Infrequent or Mild instead. |
| Medical or Treatment Information | Infrequent or Mild | The game explains vaccination, quarantine, masks and testing, and gives facts about real diseases. It gives no personal medical advice. |
| Health or Wellness Topics (if asked) | Yes, general education only | Same reason. |
| Alcohol, Tobacco, or Drug Use or References | None | |
| Simulated Gambling | None | |
| Sexual Content or Nudity | None | |
| Graphic Sexual Content and Nudity | None | |
| Contests | None | The Daily puzzle has a streak and a share text, no prizes. |
| Gambling (real money) | No | |
| Loot boxes (if asked) | No | Supply chests are earned by play, hold a fixed reward (not random), and cannot be bought. |
| Unrestricted Web Access | No | Privacy and support open in Safari, outside the app. |
| User-Generated Content (if asked) | No | |
| Messaging or Chat (if asked) | No | |
| Advertising (if asked) | Yes | Interstitial ads between levels in the free version. |
| Parental controls or age assurance (if asked) | No | |
| Made for Kids | No | Third-party ads are planned. See `categories.md`. |

## What rating to expect

"Infrequent or Mild" for Medical or Treatment Information and for Mature or Suggestive Themes puts the game above the lowest band. Expect 12+ on the older scale or 13+ on the current one. App Store Connect shows the result before you save. That rating is fine for this game and matches the privacy policy, which says it is not directed to children under 13.

Also set the ad content filter to match: `src/config/ads.js` already asks AdMob for ads rated General, and in the AdMob console set the app's maximum ad content rating to G (step 7 of `RELEASE.md`).
