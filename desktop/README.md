# Shield Desktop App

This folder packages the hosted Shield web app as a Windows desktop application.

The desktop app does not run its own database or backend. It opens the agency-hosted HTTPS Shield URL in a locked-down Electron window.

The desktop shell also checks the hosted web app every 30 seconds. When the hosted frontend changes, the window reloads while bypassing cache so users do not have to hard refresh to pick up new web deployments.

The desktop shell also provides native desktop behavior:

- It checks for desktop installer updates shortly after launch and every 15 minutes after that. Updates download automatically from `updateUrl`; once downloaded, Shield restarts to install them.
- It checks the hosted web app every 30 seconds and reloads with cache bypass when the hosted frontend changes.
- It uses OS idle/lock state to mark the signed-in user away after 5 minutes of desktop inactivity, then active again when the workstation is used.
- It mirrors unread message counts onto the taskbar/dock badge, Windows overlay icon, and tray tooltip/menu.

## Configure the App URL

For development, copy `config.example.json` to `config.json` and set the internal agency URL:

```json
{
  "appUrl": "https://your-shield-server.example.gov",
  "updateUrl": "https://your-shield-server.example.gov/downloads/",
  "allowedOrigins": [
    "https://your-shield-server.example.gov"
  ]
}
```

Before building an agency installer, create `desktop/config.json` with the production Shield URL. The installer will include it when a desktop build is run. Set `updateUrl` to the IIS folder that will host `Shield-Setup.exe`, `Shield-Setup.exe.blockmap`, and `latest.yml`.

You can also launch with:

```powershell
$env:SHIELD_DESKTOP_URL="https://your-shield-server.example.gov"
npm start
```

## Build a Windows Installer

For local unsigned testing:

```powershell
cd desktop
npm install
npm run dist
```

For the signed production installer:

```powershell
cd desktop
npm install
$env:SHIELD_UPDATE_URL="https://your-shield-server.example.gov/downloads/"
$env:CSC_LINK="C:\path\to\code-signing-certificate.pfx"
$env:CSC_KEY_PASSWORD="certificate-password"
npm run dist:production
```

The installer will be created in `desktop/release/`.

`npm run dist` creates an unsigned local installer and does not require `SHIELD_UPDATE_URL`. `npm run dist:production` is the guarded production build path. It blocks builds that still point to the example domain, do not have `desktop/config.json`, do not have `SHIELD_UPDATE_URL`, or do not have a Windows signing certificate configured.

If the desktop app opens to a blank navy screen or an error screen, press `Ctrl+Shift+I` inside the desktop window to open diagnostics. Most load issues mean `config.json` is still pointing to the example URL or the installed computer cannot reach the configured Shield URL.

To make it downloadable from Account Settings and available for automatic updates, copy these generated files from `desktop/release/` to the app downloads folder:

```text
Shield-Setup.exe
Shield-Setup.exe.blockmap
latest.yml
```

For the IIS path discussed for Shield, that would be:

```text
C:\inetpub\wwwroot\shield\downloads\Shield-Setup.exe
```

## Portable Build

For a local unsigned portable app:

```powershell
cd desktop
npm run dist:portable
```

For a signed production portable app:

```powershell
cd desktop
$env:SHIELD_UPDATE_URL="https://your-shield-server.example.gov/downloads/"
$env:CSC_LINK="C:\path\to\code-signing-certificate.pfx"
$env:CSC_KEY_PASSWORD="certificate-password"
npm run dist:portable:production
```

## Security Notes

- Node integration is disabled.
- Context isolation and sandboxing are enabled.
- Navigation is limited to the configured Shield origin.
- External links open in the user's default browser.
- The hosted Shield site should use HTTPS with a trusted certificate.
- Production installers should be signed with the agency or vendor code-signing certificate before broad deployment.
