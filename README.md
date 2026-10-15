# WebSoundboard

A mobile soundboard hosted as a static GitHub Pages site.

## Setup

1. Open **Settings → Pages** in the repository.
2. Set the source to branch `main` and folder `/(root)`.
3. After deployment, open `https://pepe-pl.github.io/WebSoundboard/`.

## Adding sounds

Add a supported audio file to `sounds/` and push to `main`. The **Generate sounds manifest** workflow updates `sounds.json`; it can also be run manually from **Actions**. **Refresh** fetches the current file list from GitHub API and falls back to the manifest when the API is unavailable.

Supported formats: MP3, WAV, OGG, M4A, AAC, and OGA. The filename becomes the button label.

Create categories in the app and assign sounds to them. Categories are saved in the browser on the current device; they are not synced to GitHub or other devices. Sounds appear immediately while their audio is decoded independently in the background. Category colors can be changed from the category tab or the assignment dialog.

## Mobile and offline use

In your phone browser, choose **Add to Home Screen**. The service worker caches the app and visited sounds so previously loaded clips can work offline. On iOS, add the shortcut from Safari's Share menu.