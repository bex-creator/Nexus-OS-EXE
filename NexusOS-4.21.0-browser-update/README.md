# Nexus OS Windows

Nexus OS packaged as a Windows Electron application.

## Build with GitHub Actions

1. Create a GitHub repository and upload the contents of this folder.
2. Keep the `.github/workflows/build-windows.yml` file in the repository.
3. Push the project to the `main` branch.
4. Open the repository's **Actions** tab and choose **Build Nexus OS for Windows**.
5. Open the completed run and download the `Nexus-OS-Windows-*` artifact.

The workflow runs on `windows-latest`, installs the dependencies, runs the project's JavaScript checks, builds the NSIS installer, and uploads the contents of `dist/`.

You can also start a build manually with **Run workflow** in GitHub Actions.

## Local build

```bash
npm install
npm run dist
```

The Windows installer is written to `dist/`.

## Nexus Password Manager

The Nexus Browser uses a persistent Chromium partition for cookies and website sessions. Its Nexus Password Manager stores each site's login separately and uses Electron's `safeStorage` encryption when available on Windows.

The browser detects ordinary username/password forms and lets you save or fill the credentials for the current website. It does not send the Nexus OS account password to unrelated websites.
