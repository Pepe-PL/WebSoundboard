<div align="center">
  <img src="icon.svg?v=3f2b517" width="150" alt="WebSoundboard icon" />
  <h1>WebSoundboard</h1>
  <p>A fast, phone-friendly meme soundboard you can make your own.</p>
  <p>
    <a href="https://pepe-pl.github.io/WebSoundboard/">
      <img src="https://img.shields.io/badge/%F0%9F%8E%A7%20LIVE%20DEMO-Open%20Soundboard-brightgreen?style=for-the-badge&logoColor=white" height="38" alt="Live Demo Soundboard" />
    </a>
  </p>
  <p>
    <a href="https://github.com/Pepe-PL/WebSoundboard/forks"><img alt="Forks" src="https://img.shields.io/github/forks/Pepe-PL/WebSoundboard" /></a>
  </p>
</div>

Fork this project, add your own audio files, and publish your personal soundboard with GitHub Pages. No server or build step is required.

## Create your soundboard

1. Click **Fork** at the top of this repository to create your copy.
2. In your fork, add audio files to the `sounds/` folder. You can use **Add file → Upload files** or add the files locally and push them to `main`.
3. Open **Actions** and allow workflows to run. The **Generate sounds manifest** workflow creates `sounds.json` when files in `sounds/` change.
4. Open **Settings → Pages** and select **Deploy from a branch**, branch `main`, folder `/(root)`. Save the setting.
5. When the Pages workflow finishes, open `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`.

If the manifest workflow cannot commit `sounds.json`, open **Settings → Actions → General → Workflow permissions** in your fork and allow **Read and write permissions**.

## Add or update sounds

Put supported audio files in `sounds/` and push to `main`. The manifest updates automatically; you can also run **Generate sounds manifest** manually from **Actions**. On startup, the app reads the live manifest from the repository and falls back to the Pages copy if GitHub is unavailable. **Refresh** asks the current repository for its sound list, so it works in forks too. New clips can appear before Pages finishes deploying; their audio is fetched from GitHub until the Pages copy is ready.

Supported formats: MP3, WAV, OGG, M4A, AAC, and OGA. Each filename becomes the sound button label. Spaces and non-ASCII characters in filenames are supported.

## Categories

Mark sounds as favorites to find them from the **Favorites** tab. Create categories, assign one or more to each sound, and choose a color for every category. Categories can be renamed, reordered, and deleted; deleting a category removes only that assignment, so sounds without another category return to **Uncategorized**. Favorites, categories, colors, and the master volume are saved in the browser on that device; they are not committed to the fork or synced to other devices.

## On your phone

Open your Pages URL in the browser and choose **Add to Home Screen**. Previously loaded sounds can be available offline. On iOS, add the shortcut from Safari's **Share** menu.

## Run locally

From the repository folder, start any static file server, for example:

```sh
python -m http.server 8080
```

Then open `http://localhost:8080`. If Python is not installed, use a static server available on your system.