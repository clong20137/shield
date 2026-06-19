# Shield Desktop App

This folder packages the hosted Shield web app as a Windows desktop application.

The desktop app does not run its own database or backend. It opens the agency-hosted HTTPS Shield URL in a locked-down Electron window.

## Configure the App URL

For development, copy `config.example.json` to `config.json` and set the internal agency URL:

```json
{
  "appUrl": "https://your-shield-server.example.gov",
  "allowedOrigins": [
    "https://your-shield-server.example.gov"
  ]
}
```

Before building an agency installer, create `desktop/config.json` with the production Shield URL. The installer will include it when `npm run dist` is run.

You can also launch with:

```powershell
$env:SHIELD_DESKTOP_URL="https://your-shield-server.example.gov"
npm start
```

## Build a Windows Installer

```powershell
cd desktop
npm install
npm run dist
```

The installer will be created in `desktop/release/`.

If the desktop app opens to a blank navy screen or an error screen, press `Ctrl+Shift+I` inside the desktop window to open diagnostics. Most load issues mean `config.json` is still pointing to the example URL or the installed computer cannot reach the configured Shield URL.

To make it downloadable from Account Settings, copy `desktop/release/Shield-Setup-1.0.0.exe` to the app downloads folder and name it `Shield-Setup.exe`.

For the IIS path discussed for Shield, that would be:

```text
C:\inetpub\wwwroot\shield\downloads\Shield-Setup.exe
```

## Portable Build

```powershell
cd desktop
npm run dist:portable
```

## Security Notes

- Node integration is disabled.
- Context isolation and sandboxing are enabled.
- Navigation is limited to the configured Shield origin.
- External links open in the user's default browser.
- The hosted Shield site should use HTTPS with a trusted certificate.
- Production installers should be signed with the agency or vendor code-signing certificate before broad deployment.
