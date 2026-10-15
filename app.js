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
const emptyState = document.querySelector('#empty-state');
const footerState = document.querySelector('#footer-state');
const themeButtons = [...document.querySelectorAll('[data-theme-choice]')];
const systemColorScheme = window.matchMedia('(prefers-color-scheme: dark)');
const categoryTabs = document.querySelector('#category-tabs');
const addCategoryButton = document.querySelector('#add-category-button');
const categoryDialog = document.querySelector('#category-dialog');
const categoryDialogForm = document.querySelector('#category-dialog-form');
const categoryDialogTitle = document.querySelector('#category-dialog-title');
const categoryDialogDescription = document.querySelector('#category-dialog-description');
const categoryDialogError = document.querySelector('#category-dialog-error');
const categoryNameField = document.querySelector('#category-name-field');
const categoryNameInput = document.querySelector('#category-name');
const categoryOptions = document.querySelector('#category-options');
const categoryDialogSave = document.querySelector('#category-dialog-save');

let sounds = [];
let audioContext = null;
let activeSource = null;
let activeAudio = null;
let activeSound = null;
let activeButton = null;
let activeCategory = 'all';
let categoryDialogMode = 'create';
let categoryTargetSound = null;
let categoryState = { categories: [], assignments: {} };

function loadCategoryState() {
  try {
    const saved = JSON.parse(localStorage.getItem('web-soundboard-categories-v1') || 'null');
    if (!saved || !Array.isArray(saved.categories)) return;

    const categories = saved.categories.filter((category) =>
      category && typeof category.id === 'string' && typeof category.name === 'string'
    );
    const validCategoryIds = new Set(categories.map((category) => category.id));
    const assignments = {};
    if (saved.assignments && typeof saved.assignments === 'object' && !Array.isArray(saved.assignments)) {
      Object.entries(saved.assignments).forEach(([path, ids]) => {
        const validIds = Array.isArray(ids) ? ids.filter((id) => validCategoryIds.has(id)) : [];
        if (validIds.length) assignments[path] = validIds;
      });
    }
    categoryState = { categories, assignments };
  } catch {}
}

function saveCategoryState() {
  try {
    localStorage.setItem('web-soundboard-categories-v1', JSON.stringify(categoryState));
    return true;
  } catch {
    setStatus('Nie można zapisać kategorii w tej przeglądarce.', 'error');
    return false;
  }
}

function categoryIdsForSound(sound) {
  return categoryState.assignments[sound.path] || [];
}

function renderCategoryTabs() {
  const categories = [
    { id: 'all', name: 'Wszystkie' },
    { id: 'uncategorized', name: 'Bez kategorii' },
    ...categoryState.categories
  ];
  categoryTabs.replaceChildren();
  categories.forEach((category) => {
    const button = document.createElement('button');
    button.className = 'category-tab';
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(activeCategory === category.id));
    button.textContent = category.name;
    button.addEventListener('click', () => {
      activeCategory = category.id;
      renderCategoryTabs();
      render();
    });
    categoryTabs.append(button);
  });
}

function showCategoryDialog(mode, sound = null) {
  categoryDialogMode = mode;
  categoryTargetSound = sound;
  categoryDialogError.hidden = true;
  categoryDialogError.textContent = '';
  categoryOptions.replaceChildren();
  categoryDialogSave.disabled = false;
  categoryNameInput.required = mode === 'create';

  if (mode === 'create') {
    categoryDialogTitle.textContent = 'Nowa kategoria';
    categoryDialogDescription.textContent = sound
      ? `Utwórz kategorię i przypisz do niej „${sound.label}”.`
      : 'Dodaj kategorię do swojej biblioteki dźwięków.';
    categoryNameField.hidden = false;
    categoryOptions.hidden = true;
    categoryNameInput.value = '';
    categoryDialogSave.textContent = 'Dodaj kategorię';
  } else {
    categoryDialogTitle.textContent = 'Kategorie dźwięku';
    categoryDialogDescription.textContent = `Wybierz kategorie dla „${sound.label}”.`;
    categoryNameField.hidden = true;
    categoryOptions.hidden = false;
    categoryDialogSave.textContent = 'Zapisz';

    if (!categoryState.categories.length) {
      const message = document.createElement('p');
      message.className = 'category-options__empty';
      message.textContent = 'Nie ma jeszcze żadnych kategorii.';
      const createButton = document.createElement('button');
      createButton.className = 'category-options__add';
      createButton.type = 'button';
      createButton.textContent = 'Utwórz pierwszą kategorię';
      createButton.addEventListener('click', () => showCategoryDialog('create', sound));
      categoryOptions.append(message, createButton);
      categoryDialogSave.disabled = true;
    } else {
      categoryDialogSave.disabled = false;
      const assignedIds = new Set(categoryIdsForSound(sound));
      categoryState.categories.forEach((category) => {
        const label = document.createElement('label');
        label.className = 'category-choice';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = category.id;
        checkbox.checked = assignedIds.has(category.id);
        const name = document.createElement('span');
        name.textContent = category.name;
        label.append(checkbox, name);
        categoryOptions.append(label);
      });
    }
  }

  if (!categoryDialog.open) categoryDialog.showModal();
  if (mode === 'create') categoryNameInput.focus();
}

function createCategory(name) {
  const normalizedName = name.trim();
  if (!normalizedName) {
    categoryDialogError.textContent = 'Wpisz nazwę kategorii.';
    categoryDialogError.hidden = false;
    return;
  }
  if (categoryState.categories.some((category) => category.name.toLocaleLowerCase('pl') === normalizedName.toLocaleLowerCase('pl'))) {
    categoryDialogError.textContent = 'Kategoria o tej nazwie już istnieje.';
    categoryDialogError.hidden = false;
    return;
  }

  const category = {
    id: `category-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: normalizedName
  };
  categoryState.categories.push(category);
  if (categoryTargetSound) categoryState.assignments[categoryTargetSound.path] = [...categoryIdsForSound(categoryTargetSound), category.id];
  saveCategoryState();
  activeCategory = category.id;
  categoryDialog.close();
  categoryTargetSound = null;
  renderCategoryTabs();
  render();
}

loadCategoryState();

addCategoryButton.addEventListener('click', () => showCategoryDialog('create'));
document.querySelector('#category-dialog-close').addEventListener('click', () => categoryDialog.close());
document.querySelector('#category-dialog-cancel').addEventListener('click', () => categoryDialog.close());
categoryDialog.addEventListener('click', (event) => {
  if (event.target === categoryDialog) categoryDialog.close();
});
categoryDialogForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (categoryDialogMode === 'create') {
    createCategory(categoryNameInput.value);
    return;
  }
  if (!categoryTargetSound) return;

  const selectedIds = [...categoryOptions.querySelectorAll('input:checked')].map((checkbox) => checkbox.value);
  if (selectedIds.length) categoryState.assignments[categoryTargetSound.path] = selectedIds;
  else delete categoryState.assignments[categoryTargetSound.path];
  saveCategoryState();
  categoryDialog.close();
  categoryTargetSound = null;
  renderCategoryTabs();
  render();
});

function updateThemeColor(theme) {
  const isDark = theme === 'dark' || (theme === 'system' && systemColorScheme.matches);
  document.querySelector('meta[name="theme-color"]').content = isDark ? '#191b18' : '#f3f0e8';
}

function applyTheme(theme, persist = false) {
  document.documentElement.dataset.theme = theme;
  themeButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
  });
  updateThemeColor(theme);
  if (persist) {
    try {
      localStorage.setItem('web-soundboard-theme', theme);
    } catch {}
  }
}

let savedTheme = 'system';
try {
  const storedTheme = localStorage.getItem('web-soundboard-theme');
  if (['system', 'light', 'dark'].includes(storedTheme)) savedTheme = storedTheme;
} catch {}
applyTheme(savedTheme);

themeButtons.forEach((button) => {
  button.addEventListener('click', () => applyTheme(button.dataset.themeChoice, true));
});

const handleSystemThemeChange = () => {
  if (document.documentElement.dataset.theme === 'system') updateThemeColor('system');
};
if (systemColorScheme.addEventListener) systemColorScheme.addEventListener('change', handleSystemThemeChange);
else systemColorScheme.addListener(handleSystemThemeChange);

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

function createFallbackAudio(sound) {
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
  return audio;
}

function updateSoundReadiness(sound, state) {
  sound.prepareState = state;
  if (!sound.button || sound === activeSound) return;
  const stateLabel = sound.button.querySelector('.sound-button__state');
  stateLabel.dataset.state = state;
  stateLabel.textContent = state === 'ready' ? 'READY' : state === 'loading' ? 'LOAD' : state === 'stream' ? 'STREAM' : 'WAIT';
}

function prepareSoundBuffer(sound) {
  if (!audioContext || sound.buffer) return Promise.resolve(sound.buffer);
  if (sound.preparePromise) return sound.preparePromise;

  updateSoundReadiness(sound, 'loading');
  sound.preparePromise = (async () => {
    try {
      const response = await fetch(audioUrl(sound.path), { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Nie można pobrać ${sound.name}`);
      sound.buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
      updateSoundReadiness(sound, 'ready');
      return sound.buffer;
    } catch {
      updateSoundReadiness(sound, 'stream');
      return null;
    } finally {
      sound.preparePromise = null;
    }
  })();
  return sound.preparePromise;
}

async function preloadSoundBuffers(entries) {
  const pendingSounds = entries.filter((sound) => !sound.buffer);
  let nextIndex = 0;
  const workerCount = Math.min(3, pendingSounds.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < pendingSounds.length) {
      const sound = pendingSounds[nextIndex];
      nextIndex += 1;
      await prepareSoundBuffer(sound);
    }
  }));
}

function prepareSounds(entries) {
  const previousByPath = new Map(sounds.map((sound) => [sound.path, sound]));
  const preparedSounds = entries.map((entry) => {
    const previous = previousByPath.get(entry.path);
    return {
      ...entry,
      audio: previous?.audio || null,
      buffer: previous?.buffer || null,
      button: null,
      preparePromise: null,
      prepareState: previous?.buffer ? 'ready' : 'queued'
    };
  });
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    preparedSounds.forEach((sound) => { sound.prepareState = 'stream'; });
    return preparedSounds;
  }

  audioContext ??= new AudioContextClass();
  void preloadSoundBuffers(preparedSounds);
  return preparedSounds;
}

function stopPlayback() {
  if (activeSource) {
    const source = activeSource;
    activeSource = null;
    source.onended = null;
    try {
      source.stop();
    } catch {}
    source.disconnect();
  }
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
  }
  if (activeButton) {
    const stateLabel = activeButton.querySelector('.sound-button__state');
    const state = activeSound?.buffer ? 'ready' : activeSound?.prepareState || 'stream';
    stateLabel.dataset.state = state;
    stateLabel.textContent = state === 'ready' ? 'READY' : state === 'loading' ? 'LOAD' : state === 'queued' ? 'WAIT' : 'STREAM';
  }
  activeButton?.classList.remove('is-playing');
  activeButton?.setAttribute('aria-pressed', 'false');
  activeAudio = null;
  activeSound = null;
  activeButton = null;
}

function playSound(sound, button) {
  stopPlayback();
  if (audioContext?.state === 'suspended') audioContext.resume().catch(() => {});
  activeSound = sound;
  activeButton = button;
  button.classList.add('is-playing');
  button.querySelector('.sound-button__state').textContent = 'PLAYING';
  button.setAttribute('aria-pressed', 'true');
  setStatus(`Odtwarzanie: ${sound.label}`);

  if (sound.buffer && audioContext) {
    const source = audioContext.createBufferSource();
    source.buffer = sound.buffer;
    source.connect(audioContext.destination);
    source.onended = () => {
      if (activeSource !== source) return;
      source.disconnect();
      activeSource = null;
      activeSound = null;
      activeButton?.classList.remove('is-playing');
      activeButton?.setAttribute('aria-pressed', 'false');
      activeButton = null;
      setStatus('Gotowe do odtworzenia');
    };
    activeSource = source;
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    source.start();
    return;
  }

  if (audioContext && sound.prepareState !== 'stream') void prepareSoundBuffer(sound);
  const audio = sound.audio || (sound.audio = createFallbackAudio(sound));
  activeAudio = audio;
  audio.currentTime = 0;
  const playback = audio.play();
  if (playback && typeof playback.catch === 'function') {
    playback.catch(() => {
      if (activeSound !== sound) return;
      stopPlayback();
      setStatus('Nie udało się odtworzyć dźwięku. Spróbuj ponownie.', 'error');
    });
  }
}

function render() {
  const query = search.value.trim().toLocaleLowerCase('pl');
  renderCategoryTabs();
  const visibleSounds = sounds.filter((sound) => {
    const matchesSearch = sound.label.toLocaleLowerCase('pl').includes(query);
    const assignedIds = categoryIdsForSound(sound);
    const matchesCategory = activeCategory === 'all'
      || (activeCategory === 'uncategorized' ? assignedIds.length === 0 : assignedIds.includes(activeCategory));
    return matchesSearch && matchesCategory;
  });
  grid.replaceChildren();
  count.textContent = String(sounds.length).padStart(2, '0');
  emptyState.hidden = visibleSounds.length > 0;
  emptyState.textContent = query
    ? 'Nie znaleziono pasujących dźwięków.'
    : activeCategory === 'uncategorized'
      ? 'Wszystkie dźwięki są już przypisane do kategorii.'
      : 'W tej kategorii nie ma jeszcze dźwięków.';

  visibleSounds.forEach((sound, index) => {
    const card = document.createElement('article');
    card.className = 'sound-card';
    const button = document.createElement('button');
    button.className = 'sound-button';
    button.type = 'button';
    button.setAttribute('aria-label', `Odtwórz ${sound.label}`);
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = `
      <span class="sound-button__top">
        <span class="sound-button__index">SOUND / ${String(index + 1).padStart(2, '0')}</span>
        <span class="sound-button__play" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M3 1.8v8.4L10 6 3 1.8Z"></path></svg></span>
      </span>
      <span class="sound-button__name"></span>
      <span class="sound-button__bottom">
        <span class="sound-button__state"></span>
        <span class="sound-button__format">${sound.extension.toUpperCase()}</span>
      </span>`;
    button.querySelector('.sound-button__name').textContent = sound.label;
    sound.button = button;
    updateSoundReadiness(sound, sound.buffer ? 'ready' : sound.prepareState || 'queued');
    if (sound === activeSound) {
      button.classList.add('is-playing');
      button.setAttribute('aria-pressed', 'true');
      button.querySelector('.sound-button__state').textContent = 'PLAYING';
      activeButton = button;
    }
    button.addEventListener('click', () => playSound(sound, button));

    const categoryButton = document.createElement('button');
    categoryButton.className = 'sound-category-button';
    categoryButton.type = 'button';
    categoryButton.setAttribute('aria-label', `Edytuj kategorie dla ${sound.label}`);
    categoryButton.title = 'Edytuj kategorie';
    categoryButton.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 5.5h6l2 2h7v8.8H2.5z"></path><path d="M2.5 5.5v-2h6l2 2"></path></svg><span class="sound-category-button__label"></span>';
    const assignedNames = categoryState.categories
      .filter((category) => categoryIdsForSound(sound).includes(category.id))
      .map((category) => category.name);
    categoryButton.querySelector('.sound-category-button__label').textContent = assignedNames.join(' / ') || 'Dodaj do kategorii';
    categoryButton.addEventListener('click', () => showCategoryDialog('assign', sound));
    card.append(button, categoryButton);
    grid.append(card);
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