const REPO_OWNER = 'Pepe-PL';
const REPO_NAME = 'WebSoundboard';
const BRANCH = 'main';
const MANIFEST_URL = new URL('./sounds.json', document.baseURI);
const API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/sounds?ref=${BRANCH}`;
const SUPPORTED_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'oga']);

const grid = document.querySelector('#sound-grid');
const statusLine = document.querySelector('#status');
const count = document.querySelector('#clip-count');
const search = document.querySelector('#search');
const refreshButton = document.querySelector('#refresh-button');
const stopButton = document.querySelector('#stop-button');
const emptyState = document.querySelector('#empty-state');
const footerState = document.querySelector('#footer-state');

let sounds = [];
let activeAudio = null;
let activeButton = null;

function setStatus(message, state = 'ready') {
  statusLine.dataset.state = state;
  statusLine.lastElementChild.textContent = message;
}

function toSound(entry) {
  if (!entry || typeof entry.path !== 'string' || typeof entry.name !== 'string') return null;
  const path = entry.path.replaceAll('\\', '/');
  const extension = path.split('.').pop().toLowerCase();
  if (!path.startsWith('sounds/') || path.split('/').includes('..') || !SUPPORTED_EXTENSIONS.has(extension)) return null;

  const baseName = entry.name.replace(/\.[^.]+$/, '');
  const label = (typeof entry.label === 'string' ? entry.label : baseName).replace(/[_-]+/g, ' ').trim();
  return { name: entry.name, label, path, extension };
}

function normaliseList(entries) {
  if (!Array.isArray(entries)) throw new Error('Nieprawidłowy format listy dźwięków.');
  return entries.map(toSound).filter(Boolean).sort((first, second) => first.label.localeCompare(second.label, 'pl'));
}

async function fetchManifest() {
  const url = new URL(MANIFEST_URL);
  url.searchParams.set('v', Date.now().toString());
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Manifest dźwięków jest niedostępny.');
  return normaliseList(await response.json());
}

async function fetchFromGitHub() {
  const response = await fetch(API_URL, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error('GitHub API jest chwilowo niedostępne.');
  const files = await response.json();
  return normaliseList(files.filter((file) => file.type === 'file').map((file) => ({ name: file.name, path: file.path })));
}

function audioUrl(path) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return new URL(encodedPath, document.baseURI).href;
}

function prepareSounds(entries) {
  return entries.map((sound) => {
    const audio = new Audio(audioUrl(sound.path));
    audio.preload = 'auto';
    audio.addEventListener('ended', () => {
      if (activeAudio === audio) {
        stopPlayback();
        setStatus('Gotowe do odtworzenia');
      }
    });
    audio.addEventListener('error', () => {
      if (activeAudio === audio) {
        stopPlayback();
        setStatus(`Nie można wczytać: ${sound.label}`, 'error');
      }
    });
    return { ...sound, audio };
  });
}

function stopPlayback() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
  }
  if (activeButton) activeButton.querySelector('.sound-button__state').textContent = 'READY';
  activeButton?.classList.remove('is-playing');
  activeButton?.setAttribute('aria-pressed', 'false');
  activeAudio = null;
  activeButton = null;
  stopButton.disabled = true;
}

function playSound(sound, button, audio) {
  stopPlayback();
  activeAudio = audio;
  activeButton = button;
  audio.currentTime = 0;
  button.classList.add('is-playing');
  button.querySelector('.sound-button__state').textContent = 'PLAYING';
  button.setAttribute('aria-pressed', 'true');
  stopButton.disabled = false;
  setStatus(`Odtwarzanie: ${sound.label}`);

  const playback = audio.play();
  if (playback && typeof playback.catch === 'function') {
    playback.catch(() => {
      if (activeAudio !== audio) return;
      stopPlayback();
      setStatus('Nie udało się odtworzyć dźwięku. Spróbuj ponownie.', 'error');
    });
  }
}

function render() {
  const query = search.value.trim().toLocaleLowerCase('pl');
  const visibleSounds = sounds.filter((sound) => sound.label.toLocaleLowerCase('pl').includes(query));
  grid.replaceChildren();
  count.textContent = String(sounds.length).padStart(2, '0');
  emptyState.hidden = visibleSounds.length > 0;

  visibleSounds.forEach((sound, index) => {
    const button = document.createElement('button');
    button.className = 'sound-button';
    button.type = 'button';
    button.setAttribute('aria-label', `Odtwórz ${sound.label}`);
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = `
      <span class="sound-button__top">
        <span class="sound-button__index">SOUND / ${String(index + 1).padStart(2, '0')}</span>
        <span class="sound-button__play" aria-hidden="true">▶</span>
      </span>
      <span class="sound-button__name"></span>
      <span class="sound-button__bottom">
        <span class="sound-button__state">READY</span>
        <span class="sound-button__format">${sound.extension.toUpperCase()}</span>
      </span>`;
    button.querySelector('.sound-button__name').textContent = sound.label;
    if (sound.audio === activeAudio) {
      button.classList.add('is-playing');
      button.setAttribute('aria-pressed', 'true');
      button.querySelector('.sound-button__state').textContent = 'PLAYING';
      activeButton = button;
    }
    button.addEventListener('click', () => playSound(sound, button, sound.audio));
    grid.append(button);
  });
}

async function loadSounds({ refresh = false } = {}) {
  refreshButton.disabled = true;
  grid.setAttribute('aria-busy', 'true');
  setStatus(refresh ? 'Odświeżanie listy' : 'Ładowanie biblioteki', 'loading');

  try {
    let loadedSounds;
    if (refresh) {
      try {
        loadedSounds = await fetchFromGitHub();
      } catch {
        loadedSounds = await fetchManifest();
      }
    } else {
      try {
        loadedSounds = await fetchManifest();
      } catch {
        loadedSounds = await fetchFromGitHub();
      }
    }

    stopPlayback();
    sounds = prepareSounds(loadedSounds);
    render();
    const source = refresh ? 'lista zaktualizowana' : 'biblioteka gotowa';
    setStatus(sounds.length ? `${source} / ${sounds.length} dźwięków` : 'Brak plików audio w /sounds');
    footerState.textContent = 'SOUND SYSTEM / ONLINE';
  } catch (error) {
    sounds = [];
    render();
    setStatus(error.message || 'Nie udało się wczytać listy.', 'error');
    footerState.textContent = 'SOUND SYSTEM / OFFLINE';
  } finally {
    refreshButton.disabled = false;
    grid.setAttribute('aria-busy', 'false');
  }
}

search.addEventListener('input', render);
refreshButton.addEventListener('click', () => loadSounds({ refresh: true }));
stopButton.addEventListener('click', () => {
  stopPlayback();
  setStatus('Odtwarzanie zatrzymane');
});

document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    event.preventDefault();
    search.focus();
  }
  if (event.key === 'Escape' && document.activeElement === search) {
    search.value = '';
    render();
    search.blur();
  }
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('./sw.js', document.baseURI)).catch(() => {});
  });
}

loadSounds();