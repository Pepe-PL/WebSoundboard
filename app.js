const REPO_OWNER = 'Pepe-PL';
const REPO_NAME = 'WebSoundboard';
const BRANCH = 'main';
const MANIFEST_URL = new URL('./sounds.json', document.baseURI);
const SUPPORTED_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'oga']);
const CATEGORY_COLORS = ['#d6f05a', '#f05b42', '#66c6d1', '#f6c950', '#ed9ec0'];

function getRepositoryApiUrl(hostname, pathname) {
  const pagesOwner = hostname.match(/^([^.]+)\.github\.io$/i)?.[1];
  const pagesRepository = pathname.split('/').filter(Boolean)[0];
  const owner = pagesOwner || REPO_OWNER;
  const repository = pagesOwner && pagesRepository ? decodeURIComponent(pagesRepository) : REPO_NAME;
  return `https://api.github.com/repos/${owner}/${repository}/contents/sounds?ref=${BRANCH}`;
}

const API_URL = getRepositoryApiUrl(location.hostname, location.pathname);

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
const categoryColorField = document.querySelector('#category-color-field');
const categoryColorInput = document.querySelector('#category-color');
const categoryOptions = document.querySelector('#category-options');
const categoryManagementControls = document.querySelector('#category-management-controls');
const categoryDialogSave = document.querySelector('#category-dialog-save');
const masterVolumeInput = document.querySelector('#master-volume');
const volumeValue = document.querySelector('#volume-value');

let sounds = [];
let audioContext = null;
let masterGain = null;
let masterVolume = 0.8;
let activeSource = null;
let activeAudio = null;
let activeSound = null;
let activeButton = null;
let activeCategory = 'all';
let categoryDialogMode = 'create';
let categoryTargetSound = null;
let categoryTargetCategory = null;
let categoryState = { categories: [], assignments: {}, favorites: [] };

function loadCategoryState() {
  try {
    const saved = JSON.parse(localStorage.getItem('web-soundboard-categories-v1') || 'null');
    if (!saved || !Array.isArray(saved.categories)) return;

    const categories = saved.categories
      .filter((category) => category && typeof category.id === 'string' && typeof category.name === 'string')
      .map((category, index) => ({
        ...category,
        color: /^#[0-9a-f]{6}$/i.test(category.color || '')
          ? category.color
          : CATEGORY_COLORS[index % CATEGORY_COLORS.length]
      }));
    const validCategoryIds = new Set(categories.map((category) => category.id));
    const assignments = {};
    if (saved.assignments && typeof saved.assignments === 'object' && !Array.isArray(saved.assignments)) {
      Object.entries(saved.assignments).forEach(([path, ids]) => {
        const validIds = Array.isArray(ids) ? ids.filter((id) => validCategoryIds.has(id)) : [];
        if (validIds.length) assignments[path] = validIds;
      });
    }
    const favorites = Array.isArray(saved.favorites)
      ? [...new Set(saved.favorites.filter((path) => typeof path === 'string'))]
      : [];
    categoryState = { categories, assignments, favorites };
  } catch {}
}

function saveCategoryState() {
  try {
    localStorage.setItem('web-soundboard-categories-v1', JSON.stringify(categoryState));
    return true;
  } catch {
    setStatus('Could not save categories in this browser.', 'error');
    return false;
  }
}

function categoryIdsForSound(sound) {
  return categoryState.assignments[sound.path] || [];
}

function isFavorite(sound) {
  return categoryState.favorites.includes(sound.path);
}

function textColorForCategory(hexColor) {
  const channels = hexColor.slice(1).match(/.{2}/g).map((channel) => parseInt(channel, 16) / 255);
  const linearChannels = channels.map((channel) => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * linearChannels[0] + 0.7152 * linearChannels[1] + 0.0722 * linearChannels[2];
  return luminance > 0.179 ? '#20211e' : '#ffffff';
}

function renderCategoryTabs() {
  const categories = [
    { id: 'all', name: 'All' },
    { id: 'favorites', name: 'Favorites' },
    { id: 'uncategorized', name: 'Uncategorized' },
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
    if (categoryState.categories.includes(category)) {
      const group = document.createElement('div');
      group.className = 'category-tab-group';
      group.append(button);

      const colorPicker = document.createElement('label');
      colorPicker.className = 'category-color-picker';
      const input = document.createElement('input');
      input.type = 'color';
      input.value = category.color;
      input.setAttribute('aria-label', `Change ${category.name} category color`);
      input.title = `Change ${category.name} category color`;
      input.addEventListener('change', () => {
        category.color = input.value.toLowerCase();
        saveCategoryState();
        render();
      });
      colorPicker.append(input);
      group.append(colorPicker);

      const manageButton = document.createElement('button');
      manageButton.className = 'category-manage-button';
      manageButton.type = 'button';
      manageButton.setAttribute('aria-label', `Manage ${category.name} category`);
      manageButton.title = `Manage ${category.name}`;
      manageButton.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8.3 2.8h3.4l.5 1.8 1.6.9 1.8-.5 1.7 2.9-1.3 1.3v1.8l1.3 1.3-1.7 2.9-1.8-.5-1.6.9-.5 1.8H8.3l-.5-1.8-1.6-.9-1.8.5-1.7-2.9L4 10.8V9L2.7 7.7l1.7-2.9 1.8.5 1.6-.9z"></path><circle cx="10" cy="9.9" r="2.3"></circle></svg>';
      manageButton.addEventListener('click', () => showCategoryDialog('manage', category));
      group.append(manageButton);
      categoryTabs.append(group);
      return;
    }
    categoryTabs.append(button);
  });
}

function showCategoryDialog(mode, sound = null) {
  categoryDialogMode = mode;
  categoryTargetSound = mode === 'manage' ? null : sound;
  categoryTargetCategory = mode === 'manage' ? sound : null;
  categoryDialogError.hidden = true;
  categoryDialogError.textContent = '';
  categoryOptions.replaceChildren();
  categoryDialogSave.disabled = false;
  categoryNameInput.required = mode !== 'assign';

  if (mode === 'create') {
    categoryDialogTitle.textContent = 'New category';
    categoryDialogDescription.textContent = sound
      ? `Create a category and assign "${sound.label}" to it.`
      : 'Add a category to your sound library.';
    categoryNameField.hidden = false;
    categoryColorField.hidden = false;
    categoryOptions.hidden = true;
    categoryManagementControls.hidden = true;
    categoryManagementControls.hidden = true;
    categoryNameInput.value = '';
    categoryColorInput.value = CATEGORY_COLORS[categoryState.categories.length % CATEGORY_COLORS.length];
    categoryDialogSave.textContent = 'Add category';
  } else if (mode === 'assign') {
    categoryDialogTitle.textContent = 'Sound categories';
    categoryDialogDescription.textContent = `Choose categories for "${sound.label}".`;
    categoryNameField.hidden = true;
    categoryColorField.hidden = true;
    categoryOptions.hidden = false;
    categoryManagementControls.hidden = true;
    categoryManagementControls.hidden = true;
    categoryDialogSave.textContent = 'Save';

    if (!categoryState.categories.length) {
      const message = document.createElement('p');
      message.className = 'category-options__empty';
      message.textContent = 'There are no categories yet.';
      const createButton = document.createElement('button');
      createButton.className = 'category-options__add';
      createButton.type = 'button';
      createButton.textContent = 'Create the first category';
      createButton.addEventListener('click', () => showCategoryDialog('create', sound));
      categoryOptions.append(message, createButton);
      categoryDialogSave.disabled = true;
    } else {
      categoryDialogSave.disabled = false;
      const assignedIds = new Set(categoryIdsForSound(sound));
      categoryState.categories.forEach((category) => {
        const choice = document.createElement('div');
        choice.className = 'category-choice';
        const nameLabel = document.createElement('label');
        nameLabel.className = 'category-choice__name';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `category-check-${category.id}`;
        checkbox.value = category.id;
        checkbox.checked = assignedIds.has(category.id);
        const name = document.createElement('span');
        name.textContent = category.name;
        nameLabel.htmlFor = checkbox.id;
        nameLabel.append(checkbox, name);
        const colorInput = document.createElement('input');
        colorInput.className = 'category-choice__color';
        colorInput.type = 'color';
        colorInput.value = category.color;
        colorInput.dataset.categoryId = category.id;
        colorInput.setAttribute('aria-label', `Color for ${category.name}`);
        choice.append(nameLabel, colorInput);
        categoryOptions.append(choice);
      });
    }
  } else {
    const categoryIndex = categoryState.categories.findIndex((category) => category.id === sound.id);
    categoryDialogTitle.textContent = 'Category settings';
    categoryDialogDescription.textContent = 'Rename, recolor, reorder, or remove this category.';
    categoryNameField.hidden = false;
    categoryColorField.hidden = false;
    categoryOptions.hidden = true;
    categoryManagementControls.hidden = false;
    categoryNameInput.value = sound.name;
    categoryColorInput.value = sound.color;
    categoryDialogSave.textContent = 'Save changes';
    document.querySelector('#category-move-left').disabled = categoryIndex <= 0;
    document.querySelector('#category-move-right').disabled = categoryIndex >= categoryState.categories.length - 1;
  }

  if (!categoryDialog.open) categoryDialog.showModal();
  if (mode === 'create') categoryNameInput.focus();
}

function createCategory(name) {
  const normalizedName = name.trim();
  if (!normalizedName) {
    categoryDialogError.textContent = 'Enter a category name.';
    categoryDialogError.hidden = false;
    return;
  }
  if (categoryState.categories.some((category) => category.name.toLocaleLowerCase('en') === normalizedName.toLocaleLowerCase('en'))) {
    categoryDialogError.textContent = 'A category with that name already exists.';
    categoryDialogError.hidden = false;
    return;
  }

  const category = {
    id: `category-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: normalizedName,
    color: categoryColorInput.value.toLowerCase()
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

function moveCategory(direction) {
  if (!categoryTargetCategory) return;
  const index = categoryState.categories.findIndex((category) => category.id === categoryTargetCategory.id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= categoryState.categories.length) return;

  [categoryState.categories[index], categoryState.categories[nextIndex]] = [
    categoryState.categories[nextIndex],
    categoryState.categories[index]
  ];
  saveCategoryState();
  const category = categoryState.categories[nextIndex];
  renderCategoryTabs();
  render();
  showCategoryDialog('manage', category);
}

function deleteCategory() {
  if (!categoryTargetCategory || !window.confirm(`Delete "${categoryTargetCategory.name}"? Its sounds will become uncategorized unless they have another category.`)) return;

  const deletedId = categoryTargetCategory.id;
  categoryState.categories = categoryState.categories.filter((category) => category.id !== deletedId);
  Object.entries(categoryState.assignments).forEach(([path, ids]) => {
    const remainingIds = ids.filter((id) => id !== deletedId);
    if (remainingIds.length) categoryState.assignments[path] = remainingIds;
    else delete categoryState.assignments[path];
  });
  if (activeCategory === deletedId) activeCategory = 'all';
  saveCategoryState();
  categoryDialog.close();
  categoryTargetCategory = null;
  renderCategoryTabs();
  render();
}

loadCategoryState();

addCategoryButton.addEventListener('click', () => showCategoryDialog('create'));
document.querySelector('#category-dialog-close').addEventListener('click', () => categoryDialog.close());
document.querySelector('#category-dialog-cancel').addEventListener('click', () => categoryDialog.close());
document.querySelector('#category-move-left').addEventListener('click', () => moveCategory(-1));
document.querySelector('#category-move-right').addEventListener('click', () => moveCategory(1));
document.querySelector('#category-delete').addEventListener('click', deleteCategory);
categoryDialog.addEventListener('click', (event) => {
  if (event.target === categoryDialog) categoryDialog.close();
});
categoryDialogForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (categoryDialogMode === 'create') {
    createCategory(categoryNameInput.value);
    return;
  }
  if (categoryDialogMode === 'manage') {
    const normalizedName = categoryNameInput.value.trim();
    if (!normalizedName) {
      categoryDialogError.textContent = 'Enter a category name.';
      categoryDialogError.hidden = false;
      return;
    }
    if (categoryState.categories.some((category) =>
      category.id !== categoryTargetCategory?.id
      && category.name.toLocaleLowerCase('en') === normalizedName.toLocaleLowerCase('en')
    )) {
      categoryDialogError.textContent = 'A category with that name already exists.';
      categoryDialogError.hidden = false;
      return;
    }
    if (!categoryTargetCategory) return;

    categoryTargetCategory.name = normalizedName;
    categoryTargetCategory.color = categoryColorInput.value.toLowerCase();
    saveCategoryState();
    categoryDialog.close();
    categoryTargetCategory = null;
    renderCategoryTabs();
    render();
    return;
  }
  if (!categoryTargetSound) return;

  const selectedIds = [...categoryOptions.querySelectorAll('input:checked')].map((checkbox) => checkbox.value);
  categoryOptions.querySelectorAll('[data-category-id]').forEach((input) => {
    const category = categoryState.categories.find((entry) => entry.id === input.dataset.categoryId);
    if (category) category.color = input.value.toLowerCase();
  });
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

try {
  const storedVolume = Number(localStorage.getItem('web-soundboard-volume'));
  if (Number.isFinite(storedVolume) && localStorage.getItem('web-soundboard-volume') !== null) {
    masterVolume = Math.min(1, Math.max(0, storedVolume));
  }
} catch {}

function setMasterVolume(value, persist = true) {
  masterVolume = Math.min(1, Math.max(0, Number(value)));
  masterVolumeInput.value = String(masterVolume);
  volumeValue.value = `${Math.round(masterVolume * 100)}%`;
  volumeValue.textContent = volumeValue.value;
  if (masterGain && audioContext) masterGain.gain.setTargetAtTime(masterVolume, audioContext.currentTime, 0.015);
  sounds.forEach((sound) => {
    if (sound.audio) sound.audio.volume = masterVolume;
  });
  if (persist) {
    try {
      localStorage.setItem('web-soundboard-volume', String(masterVolume));
    } catch {}
  }
}

setMasterVolume(masterVolume, false);
masterVolumeInput.addEventListener('input', () => setMasterVolume(masterVolumeInput.value));

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
  return {
    name: entry.name,
    label,
    path,
    extension,
    downloadUrl: typeof entry.download_url === 'string' ? entry.download_url : null
  };
}

function normaliseList(entries) {
  if (!Array.isArray(entries)) throw new Error('Invalid sound list format.');
  return entries.map(toSound).filter(Boolean).sort((first, second) => first.label.localeCompare(second.label, 'en'));
}

async function fetchManifest() {
  const sources = [
    `https://raw.githubusercontent.com/${apiOwner}/${apiRepository}/${BRANCH}/sounds.json`,
    MANIFEST_URL
  ];
  let lastError;
  for (const source of sources) {
    const url = new URL(source);
    url.searchParams.set('v', Date.now().toString());
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('The sound manifest is unavailable.');
      return normaliseList(await response.json());
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('The sound manifest is unavailable.');
}

async function fetchFromGitHub() {
  const response = await fetch(API_URL, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error('GitHub API is temporarily unavailable.');
  const files = await response.json();
  return normaliseList(files.filter((file) => file.type === 'file').map((file) => ({
    name: file.name,
    path: file.path,
    download_url: file.download_url
  })));
}

function audioUrl(path) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return new URL(encodedPath, document.baseURI).href;
}

function rawAudioUrl(sound) {
  if (sound.downloadUrl) return sound.downloadUrl;
  const encodedPath = sound.path.split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${apiOwner}/${apiRepository}/${BRANCH}/${encodedPath}`;
}

function failFallbackPlayback(sound, audio) {
  if (activeSound !== sound) return;
  stopPlayback();
  setStatus(`Could not play ${sound.label}.`, 'error');
}

function retryFallbackFromGitHub(sound, audio) {
  const rawUrl = rawAudioUrl(sound);
  if (sound.rawFallbackAttempted || audio.src === rawUrl) return false;
  sound.rawFallbackAttempted = true;
  sound.fallbackUrl = rawUrl;
  audio.src = rawUrl;
  audio.load();
  playFallbackAudio(sound, audio);
  return true;
}

function playFallbackAudio(sound, audio) {
  const sourceUrl = audio.src;
  const playback = audio.play();
  if (playback && typeof playback.catch === 'function') {
    playback.catch(() => {
      if (activeSound !== sound || audio.src !== sourceUrl) return;
      if (!retryFallbackFromGitHub(sound, audio)) failFallbackPlayback(sound, audio);
    });
  }
}

function createFallbackAudio(sound) {
  const audio = new Audio(sound.fallbackUrl || audioUrl(sound.path));
  audio.preload = 'auto';
  audio.volume = masterVolume;
  audio.addEventListener('ended', () => {
    if (activeAudio === audio) {
      stopPlayback();
      setStatus('Ready to play');
    }
  });
  audio.addEventListener('error', () => {
    if (activeAudio === audio) {
      if (!retryFallbackFromGitHub(sound, audio)) failFallbackPlayback(sound, audio);
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
    const sources = [...new Set([audioUrl(sound.path), sound.downloadUrl || rawAudioUrl(sound)])];
    for (const sourceUrl of sources) {
      try {
        const response = await fetch(sourceUrl, { cache: 'force-cache' });
        if (!response.ok) continue;
        sound.buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
        sound.fallbackUrl = sourceUrl;
        updateSoundReadiness(sound, 'ready');
        return sound.buffer;
      } catch {}
    }

    sound.fallbackUrl = rawAudioUrl(sound);
    updateSoundReadiness(sound, 'stream');
    return null;
  })().finally(() => {
    sound.preparePromise = null;
  });
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
  if (!masterGain) {
    masterGain = audioContext.createGain();
    masterGain.gain.value = masterVolume;
    masterGain.connect(audioContext.destination);
  }
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
  setStatus(`Playing: ${sound.label}`);

  if (sound.buffer && audioContext) {
    const source = audioContext.createBufferSource();
    source.buffer = sound.buffer;
    source.connect(masterGain || audioContext.destination);
    source.onended = () => {
      if (activeSource !== source) return;
      source.disconnect();
      activeSource = null;
      activeSound = null;
      activeButton?.classList.remove('is-playing');
      activeButton?.setAttribute('aria-pressed', 'false');
      activeButton = null;
      setStatus('Ready to play');
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
      setStatus('Could not play this sound. Try again.', 'error');
    });
  }
}

function render() {
  const query = search.value.trim().toLocaleLowerCase('en');
  renderCategoryTabs();
  const visibleSounds = sounds.filter((sound) => {
    const matchesSearch = sound.label.toLocaleLowerCase('en').includes(query);
    const assignedIds = categoryIdsForSound(sound);
    const matchesCategory = activeCategory === 'all'
      || (activeCategory === 'favorites'
        ? isFavorite(sound)
        : activeCategory === 'uncategorized'
          ? assignedIds.length === 0
          : assignedIds.includes(activeCategory));
    return matchesSearch && matchesCategory;
  });
  grid.replaceChildren();
  count.textContent = String(sounds.length).padStart(2, '0');
  emptyState.hidden = visibleSounds.length > 0;
  emptyState.textContent = query
    ? 'No matching sounds found.'
    : activeCategory === 'favorites'
      ? 'No favorite sounds yet.'
      : activeCategory === 'uncategorized'
        ? 'All sounds are already assigned to categories.'
        : 'There are no sounds in this category yet.';

  visibleSounds.forEach((sound, index) => {
    const card = document.createElement('article');
    card.className = 'sound-card';
    const button = document.createElement('button');
    button.className = 'sound-button';
    button.type = 'button';
    button.setAttribute('aria-label', `Play ${sound.label}`);
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
    const assignedCategories = categoryState.categories.filter((category) => categoryIdsForSound(sound).includes(category.id));
    const colorCategory = activeCategory === 'all' || activeCategory === 'uncategorized'
      ? assignedCategories[0]
      : assignedCategories.find((category) => category.id === activeCategory);
    if (colorCategory) {
      button.style.setProperty('--tone', colorCategory.color);
      button.style.setProperty('--tile-ink', textColorForCategory(colorCategory.color));
    }
    sound.button = button;
    updateSoundReadiness(sound, sound.buffer ? 'ready' : sound.prepareState || 'queued');
    if (sound === activeSound) {
      button.classList.add('is-playing');
      button.setAttribute('aria-pressed', 'true');
      button.querySelector('.sound-button__state').textContent = 'PLAYING';
      activeButton = button;
    }
    button.addEventListener('click', () => playSound(sound, button));

    const favoriteButton = document.createElement('button');
    favoriteButton.className = 'favorite-button';
    favoriteButton.type = 'button';
    favoriteButton.setAttribute('aria-pressed', String(isFavorite(sound)));
    favoriteButton.setAttribute('aria-label', `${isFavorite(sound) ? 'Remove' : 'Add'} ${sound.label} ${isFavorite(sound) ? 'from' : 'to'} favorites`);
    favoriteButton.title = isFavorite(sound) ? 'Remove from favorites' : 'Add to favorites';
    favoriteButton.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 17s-6.5-3.8-6.5-9A3.7 3.7 0 0 1 10 5.8 3.7 3.7 0 0 1 16.5 8c0 5.2-6.5 9-6.5 9Z"></path></svg>';
    favoriteButton.addEventListener('click', () => {
      if (isFavorite(sound)) categoryState.favorites = categoryState.favorites.filter((path) => path !== sound.path);
      else categoryState.favorites.push(sound.path);
      saveCategoryState();
      renderCategoryTabs();
      render();
    });

    const categoryButton = document.createElement('button');
    categoryButton.className = 'sound-category-button';
    categoryButton.type = 'button';
    categoryButton.setAttribute('aria-label', `Edit categories for ${sound.label}`);
    categoryButton.title = 'Edit categories';
    categoryButton.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 5.5h6l2 2h7v8.8H2.5z"></path><path d="M2.5 5.5v-2h6l2 2"></path></svg><span class="sound-category-button__label"></span>';
    const assignedNames = categoryState.categories
      .filter((category) => categoryIdsForSound(sound).includes(category.id))
      .map((category) => category.name);
    categoryButton.querySelector('.sound-category-button__label').textContent = assignedNames.join(' / ') || 'Add to category';
    categoryButton.addEventListener('click', () => showCategoryDialog('assign', sound));
    card.append(button, favoriteButton, categoryButton);
    grid.append(card);
  });
}

async function loadSounds({ refresh = false } = {}) {
  refreshButton.disabled = true;
  grid.setAttribute('aria-busy', 'true');
  setStatus(refresh ? 'Refreshing list' : 'Loading library', 'loading');

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
    const source = refresh ? 'list updated' : 'library ready';
    setStatus(sounds.length ? `${source} / ${sounds.length} sounds` : 'No audio files in /sounds');
    footerState.textContent = 'SOUND SYSTEM / ONLINE';
  } catch (error) {
    sounds = [];
    render();
    setStatus(error.message || 'Could not load the sound list.', 'error');
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