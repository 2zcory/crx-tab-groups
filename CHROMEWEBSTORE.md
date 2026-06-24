# Chrome Web Store Listing — Groupify: Auto Tab Organizer

> Last Updated: 2026-06-24

## Store Listing

**Extension Name** [REQUIRED]
Groupify: Auto Tab Organizer

**Short Description** [REQUIRED]
Auto-organize tab groups with rules, inspect live tabs, and save/restore snapshots in a side panel.

**Detailed Description** [REQUIRED]
Groupify helps you take control of your browser tabs by automating group organization and snapshot management, all accessible from a sleek and responsive side panel.

Key Features:
- Automation Rules: Automatically group newly opened or updated tabs based on custom URL patterns (hosts, globs, or regex) matched case-insensitively.
- Live Tab Inspector: View and manage all your active tabs and groups in a beautiful glassmorphic side-panel interface.
- Session Snapshots: Save your current tab groups as restorable session snapshots. Snapshots are static, meaning your live tab changes won't accidentally overwrite them.
- Sleek Design Themes: Personalize your workspaces with premium styles including Frosted Light, Aurora Dark, Minimal Clear, Warm Glass, and Monochrome.

How to Use:
1. Click the Groupify extension icon to open the side panel.
2. Under the "Live" tab, view your current browser windows and tab groups.
3. Switch to the "Rules" tab to create your first automation rule (e.g., matching "github.com" to a blue "GitHub" group).
4. Save a snapshot of your current session on the "Saved" tab to restore it anytime with a single click.

Privacy & Permissions:
All data is stored locally in your browser's extension storage and synchronized across your own devices using Chrome's secure Sync Storage. We do not run external servers, track your browsing history, or collect any personal information.

Support & Feedback:
For feedback or issues, please visit our project homepage or open an issue on our support page.

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Auto-organizes browser tab groups based on custom rules and manages restorable session snapshots in a side panel.

**Primary Language** [REQUIRED]
English

---

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `public/img/logo-128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | 🟡 Needs update | *Needs capture of the live view side panel* |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | 🟡 Needs update | *Needs capture of the rules automation view* |
| Screenshot 3 [RECOMMENDED] | 1280×800 or 640×400 | 🟡 Needs update | *Needs capture of the saved snapshots view* |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |

---

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `sidePanel` | permissions | Used to host the extension's interactive tab management panel continuously alongside your web browsing window. |
| `tabs` | permissions | Used to retrieve active tab metadata (URLs, titles, and icons) to display in the live inspector and serialize into restorable snapshots. |
| `tabGroups` | permissions | Used to query, create, update, and sort Chrome tab groups when applying automation rules or restoring snapshots. |
| `storage` | permissions | Used to persist user configurations, automation rules, and saved snapshots across sessions using local and sync storage. |
| `topSites` | permissions | Used to display your most frequently visited sites in the live tab as quick-start suggestions. |
| `<all_urls>` | host_permissions | Required to monitor tab updates and automatically group tabs on any domain matching the user's custom automation rules. |

---

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

*Note: Groupify stores settings and snapshots locally in the user's browser using `chrome.storage.local` and `chrome.storage.sync`. Sync storage replicates data across the user's authenticated Google devices. No data is collected, sold, or shared with third parties.*

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

---

## Privacy Policy

**Privacy Policy URL** [RECOMMENDED]
*A placeholder policy should be hosted at a public URL (e.g. GitHub pages). Below is the text of the privacy policy:*

### Groupify Privacy Policy
Last updated: 2026-06-24

Groupify ("we", "our", or "us") respects your privacy. This Privacy Policy explains that Groupify does not collect, transmit, store, or share any personal data or web browsing history.

1. **Information Collection & Use**:
Groupify does not collect any personally identifiable information (PII), web traffic information, or usage analytics. All operations are performed locally in your browser.
2. **Data Storage**:
Any settings, automation rules, or tab snapshots you create are saved locally on your device via Chrome's storage API. If you enable sync, Chrome syncs these settings securely to your other Google-authenticated devices. We have no access to this data.
3. **Changes to this Policy**:
We may update our Privacy Policy from time to time. Any changes will be posted here.

---

## Distribution

**Visibility**: Public
**Regions**: All regions
**Pricing**: Free

---

## Developer Info

**Publisher Name** [REQUIRED]
2zcory

**Contact Email** [REQUIRED]
khanhtri009@gmail.com

**Support URL / Email** [RECOMMENDED]
https://github.com/2zcory/crx-tab-groups/issues

**Homepage URL** [RECOMMENDED]
https://github.com/2zcory/crx-tab-groups

---

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 0.1.0 | 2026-06-24 | Initial release: live tab inspection, rules-based auto-grouping, and restorable snapshot management. | Draft |

---

## GitHub Actions CI/CD Integration

To automate publishing stable versions to the Chrome Web Store, configure these Repository Secrets in your GitHub repository (`Settings -> Secrets and variables -> Actions`):

1. `CWS_APP_ID`: The unique identifier of your extension in the Chrome Web Store dashboard (e.g. `omjffieelhblgkclapfakpmoagphinab`).
2. `CWS_CLIENT_ID`: Google OAuth2 Client ID.
3. `CWS_CLIENT_SECRET`: Google OAuth2 Client Secret.
4. `CWS_REFRESH_TOKEN`: OAuth2 Refresh Token used to fetch access tokens dynamically.

### Step-by-Step API Setup Guide:
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project or select an existing one.
3. Enable the **Chrome Web Store API** for your project.
4. Go to **APIs & Services -> OAuth consent screen**, set User Type to External, configure essential details, and publish the app (or keep in testing and add your email as a test user).
5. Go to **APIs & Services -> Credentials**, click **Create Credentials -> OAuth client ID**. Select application type **Web application**. Add `https://developers.google.com/oauthplayground` as an Authorized Redirect URI. Save and copy the Client ID and Client Secret.
6. Open the [Google OAuth Playground](https://developers.google.com/oauthplayground):
   - Click the gear icon on the top right, check **Use your own OAuth credentials**, and input your Client ID and Client Secret.
   - Under Step 1, paste this API scope: `https://www.googleapis.com/auth/chromewebstore` and click **Authorize APIs**.
   - Sign in with your developer account and grant permission.
   - Under Step 2, click **Exchange authorization code for tokens**.
   - Copy the generated `refresh_token` from the JSON response.
7. Save these 4 keys to GitHub Secrets. Push a tag like `v0.1.0` to trigger automatic deployment.
