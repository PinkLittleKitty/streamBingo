async function compressData(dataString) {
  try {
    const uint8 = new TextEncoder().encode(dataString);
    const stream = new Blob([uint8]).stream();
    const compressedStream = stream.pipeThrough(new CompressionStream('deflate'));
    const response = new Response(compressedStream);
    const buffer = await response.arrayBuffer();

    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }

    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  } catch (err) {
    console.error('Compression failed:', err);
    throw err;
  }
}

const SHUFFLE_CODES = {
  'none': 0,
  'everything': 1,
  'rows': 2,
  'within-rows': 3
};

const SHUFFLE_MODES = ['none', 'everything', 'rows', 'within-rows'];

const gridContainer = document.getElementById('editor-grid');
const titleInput = document.getElementById('board-title');
const descInput = document.getElementById('board-desc');
const freeSpaceToggle = document.getElementById('toggle-free-space');
const shuffleModeSelect = document.getElementById('shuffle-mode');
const galleryList = document.getElementById('gallery-list');

const btnClearGrid = document.getElementById('btn-clear-grid');
const btnSaveBoard = document.getElementById('btn-save-board');
const btnGeneratePlay = document.getElementById('btn-generate-play');
const btnGenerateObs = document.getElementById('btn-generate-obs');

const shareDialog = document.getElementById('share-dialog');
const shareTitle = document.getElementById('share-title');
const shareDesc = document.getElementById('share-desc');
const shareUrlInput = document.getElementById('share-url-input');
const btnCopyUrl = document.getElementById('btn-copy-url');
const btnOpenLink = document.getElementById('btn-open-link');
const btnCloseDialog = document.getElementById('btn-close-dialog');

const cellInputs = [];
let currentEditingId = null;

function createGrid() {
  gridContainer.innerHTML = '';
  cellInputs.length = 0;

  for (let i = 0; i < 25; i++) {
    const cellWrapper = document.createElement('div');
    cellWrapper.className = 'editor-cell-wrapper';

    const label = document.createElement('span');
    label.className = 'editor-cell-label';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = `Tile ${i + 1}`;
    input.id = `input-cell-${i}`;

    if (i === 12) {
      cellWrapper.classList.add('center-cell');
      label.textContent = 'FREE SPACE';
      if (freeSpaceToggle.checked) {
        input.value = 'FREE SPACE';
        input.disabled = true;
      }
    } else {
      label.textContent = `${i + 1}`;
    }

    cellWrapper.appendChild(label);
    cellWrapper.appendChild(input);
    gridContainer.appendChild(cellWrapper);

    cellInputs.push(input);
  }
}

freeSpaceToggle.addEventListener('change', () => {
  const centerInput = cellInputs[12];
  if (freeSpaceToggle.checked) {
    centerInput.value = 'FREE SPACE';
    centerInput.disabled = true;
    centerInput.parentElement.classList.add('center-cell');
  } else {
    if (centerInput.value === 'FREE SPACE') {
      centerInput.value = '';
    }
    centerInput.disabled = false;
    centerInput.parentElement.classList.remove('center-cell');
  }
});

function getCardData() {
  const tiles = cellInputs.map(input => input.value.trim());
  return {
    title: titleInput.value.trim() || 'My Bingo Board',
    description: descInput.value.trim(),
    freeSpace: freeSpaceToggle.checked,
    shuffleMode: shuffleModeSelect.value,
    tiles: tiles
  };
}

function clearGrid() {
  cellInputs.forEach((input, index) => {
    if (index === 12 && freeSpaceToggle.checked) {
      input.value = 'FREE SPACE';
    } else {
      input.value = '';
    }
  });
}

function getCompactArray(data) {
  const shuffleCode = SHUFFLE_CODES[data.shuffleMode] !== undefined ? SHUFFLE_CODES[data.shuffleMode] : 1;
  const freeSpaceVal = data.freeSpace ? 1 : 0;

  return [
    data.title,
    data.description || '',
    freeSpaceVal,
    shuffleCode,
    ...data.tiles
  ];
}

async function generateUrl(isObs = false) {
  const data = getCardData();
  const compact = getCompactArray(data);
  const jsonStr = JSON.stringify(compact);
  const compressed = await compressData(jsonStr);

  const baseDir = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
  let url = `${baseDir}/play.html?c=${compressed}`;

  const randomSeed = Math.floor(Math.random() * 1000000);
  url += `&seed=${randomSeed}`;

  if (isObs) {
    url += '&obs=true';
  }
  return url;
}

function getSavedCards() {
  try {
    return JSON.parse(localStorage.getItem('saved_bingo_cards')) || [];
  } catch (e) {
    return [];
  }
}

function saveSavedCards(cards) {
  localStorage.setItem('saved_bingo_cards', JSON.stringify(cards));
  renderGallery();
}

function saveCurrentBoard() {
  const cardData = getCardData();
  const saved = getSavedCards();

  if (!titleInput.value.trim()) {
    alert('Please enter a board title.');
    titleInput.focus();
    return;
  }

  if (currentEditingId) {
    const index = saved.findIndex(c => c.id === currentEditingId);
    if (index !== -1) {
      saved[index] = { ...cardData, id: currentEditingId, updatedAt: new Date().toISOString() };
    } else {
      saved.push({ ...cardData, id: currentEditingId, updatedAt: new Date().toISOString() });
    }
  } else {
    const newId = 'card_' + Date.now();
    saved.push({
      ...cardData,
      id: newId,
      updatedAt: new Date().toISOString()
    });
    currentEditingId = newId;
  }

  saveSavedCards(saved);

  btnSaveBoard.style.background = 'linear-gradient(135deg, var(--accent-cyan), var(--accent-blue))';
  btnSaveBoard.style.color = '#000';
  const origHtml = btnSaveBoard.innerHTML;
  btnSaveBoard.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Saved!';
  setTimeout(() => {
    btnSaveBoard.style.background = '';
    btnSaveBoard.style.color = '';
    btnSaveBoard.innerHTML = origHtml;
  }, 1500);
}

function loadCard(id) {
  const saved = getSavedCards();
  const card = saved.find(c => c.id === id);
  if (!card) return;

  currentEditingId = card.id;
  titleInput.value = card.title;
  descInput.value = card.description || '';
  freeSpaceToggle.checked = card.freeSpace !== false;
  shuffleModeSelect.value = card.shuffleMode || 'everything';

  const centerInput = cellInputs[12];
  if (freeSpaceToggle.checked) {
    centerInput.disabled = true;
    centerInput.parentElement.classList.add('center-cell');
  } else {
    centerInput.disabled = false;
    centerInput.parentElement.classList.remove('center-cell');
  }

  card.tiles.forEach((val, idx) => {
    if (idx < cellInputs.length) {
      cellInputs[idx].value = val;
    }
  });

  document.querySelectorAll('.card-item').forEach(item => {
    item.style.borderColor = 'var(--border-color)';
  });
  const activeItem = document.getElementById(`gallery-item-${id}`);
  if (activeItem) {
    activeItem.style.borderColor = 'var(--accent-purple)';
  }
}

function deleteCard(id, event) {
  event.stopPropagation();
  if (!confirm('Are you sure you want to delete this board?')) return;

  let saved = getSavedCards();
  saved = saved.filter(c => c.id !== id);

  if (currentEditingId === id) {
    currentEditingId = null;
    clearGrid();
    titleInput.value = 'Stream Bingo';
    descInput.value = '';
    freeSpaceToggle.checked = true;
    cellInputs[12].value = 'FREE SPACE';
    cellInputs[12].disabled = true;
    cellInputs[12].parentElement.classList.add('center-cell');
    shuffleModeSelect.value = 'everything';
  }

  saveSavedCards(saved);
}

function renderGallery() {
  const cards = getSavedCards();
  galleryList.innerHTML = '';

  if (cards.length === 0) {
    galleryList.innerHTML = '<div class="gallery-empty">No boards saved yet. Create one on the right!</div>';
    return;
  }

  cards.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  cards.forEach(card => {
    const cardEl = document.createElement('div');
    cardEl.className = 'card-item';
    cardEl.id = `gallery-item-${card.id}`;
    if (card.id === currentEditingId) {
      cardEl.style.borderColor = 'var(--accent-purple)';
    }

    cardEl.addEventListener('click', () => loadCard(card.id));

    const info = document.createElement('div');
    info.className = 'card-item-info';

    const title = document.createElement('div');
    title.className = 'card-item-title';
    title.textContent = card.title;

    const meta = document.createElement('div');
    meta.className = 'card-item-meta';

    const filledCount = card.tiles.filter(t => t.trim() !== '').length;
    meta.textContent = `${filledCount}/25 cells • ${card.shuffleMode === 'none' ? 'fixed' : 'shuffled'}`;

    info.appendChild(title);
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'card-item-actions';

    const shareBtn = document.createElement('button');
    shareBtn.className = 'btn btn-secondary btn-icon';
    shareBtn.title = 'Get Shareable Links';
    shareBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>';
    shareBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const origTitle = titleInput.value;
      const origDesc = descInput.value;
      const origFree = freeSpaceToggle.checked;
      const origShuffle = shuffleModeSelect.value;
      const origTiles = cellInputs.map(i => i.value);

      titleInput.value = card.title;
      descInput.value = card.description || '';
      freeSpaceToggle.checked = card.freeSpace !== false;
      shuffleModeSelect.value = card.shuffleMode || 'everything';
      card.tiles.forEach((val, idx) => cellInputs[idx].value = val);

      const playUrl = await generateUrl(false);

      titleInput.value = origTitle;
      descInput.value = origDesc;
      freeSpaceToggle.checked = origFree;
      shuffleModeSelect.value = origShuffle;
      origTiles.forEach((val, idx) => cellInputs[idx].value = val);

      showShareModal(playUrl, `Share Link: ${card.title}`, 'Share this URL with players or paste it into a web browser.');
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger btn-icon';
    deleteBtn.title = 'Delete Board';
    deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    deleteBtn.addEventListener('click', (e) => deleteCard(card.id, e));

    actions.appendChild(shareBtn);
    actions.appendChild(deleteBtn);

    cardEl.appendChild(info);
    cardEl.appendChild(actions);
    galleryList.appendChild(cardEl);
  });
}

function showShareModal(url, title = 'Link Generated!', desc = 'Copy this URL to play or configure your board.') {
  shareTitle.textContent = title;
  shareDesc.textContent = desc;
  shareUrlInput.value = url;
  btnOpenLink.href = url;
  shareDialog.classList.add('active');
}

function closeShareModal() {
  shareDialog.classList.remove('active');
}

btnClearGrid.addEventListener('click', () => {
  if (confirm('Clear all cells in the grid?')) {
    clearGrid();
  }
});

btnSaveBoard.addEventListener('click', saveCurrentBoard);

btnGeneratePlay.addEventListener('click', async () => {
  btnGeneratePlay.disabled = true;
  try {
    const url = await generateUrl(false);
    showShareModal(url, 'Play Link Generated!', 'Players can open this link to generate their card and mark squares. It remembers progress locally!');
  } catch (e) {
    alert('Failed to generate sharing URL.');
  } finally {
    btnGeneratePlay.disabled = false;
  }
});

btnGenerateObs.addEventListener('click', async () => {
  btnGenerateObs.disabled = true;
  try {
    const url = await generateUrl(true);
    showShareModal(url, 'OBS Overlay Link Generated!', 'Add this URL as a Browser Source in OBS. Enable custom CSS and size it appropriately. Background will be transparent!');
  } catch (e) {
    alert('Failed to generate sharing URL.');
  } finally {
    btnGenerateObs.disabled = false;
  }
});

btnCopyUrl.addEventListener('click', () => {
  shareUrlInput.select();
  navigator.clipboard.writeText(shareUrlInput.value)
    .then(() => {
      btnCopyUrl.textContent = 'Copied!';
      btnCopyUrl.style.background = 'var(--accent-cyan)';
      btnCopyUrl.style.color = '#000';
      setTimeout(() => {
        btnCopyUrl.textContent = 'Copy';
        btnCopyUrl.style.background = '';
        btnCopyUrl.style.color = '';
      }, 1500);
    })
    .catch(err => {
      alert('Could not copy automatically. Please copy the text manually.');
    });
});

btnCloseDialog.addEventListener('click', closeShareModal);

shareDialog.addEventListener('click', (e) => {
  if (e.target === shareDialog) {
    closeShareModal();
  }
});

async function decompressData(base64str) {
  try {
    let standardBase64 = base64str.replace(/-/g, '+').replace(/_/g, '/');
    while (standardBase64.length % 4) {
      standardBase64 += '=';
    }
    const binaryStr = atob(standardBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const stream = new Blob([bytes]).stream();
    const decompressedStream = stream.pipeThrough(new DecompressionStream('deflate'));
    const response = new Response(decompressedStream);
    const buffer = await response.arrayBuffer();
    return new TextDecoder().decode(buffer);
  } catch (err) {
    console.error('Decompression failed:', err);
    throw err;
  }
}

async function loadCardFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const cardCompressed = urlParams.get('c');
  if (!cardCompressed) return;

  try {
    const decompressed = await decompressData(cardCompressed);
    const compact = JSON.parse(decompressed);

    titleInput.value = compact[0];
    descInput.value = compact[1] || '';
    freeSpaceToggle.checked = compact[2] === 1;
    shuffleModeSelect.value = SHUFFLE_MODES[compact[3]] || 'everything';

    const centerInput = cellInputs[12];
    if (freeSpaceToggle.checked) {
      centerInput.disabled = true;
      centerInput.parentElement.classList.add('center-cell');
    } else {
      centerInput.disabled = false;
      centerInput.parentElement.classList.remove('center-cell');
    }

    const tiles = compact.slice(4);
    tiles.forEach((val, idx) => {
      if (idx < cellInputs.length) {
        cellInputs[idx].value = val;
      }
    });
  } catch (e) {
    console.error('Failed to load card from URL:', e);
  }
}

createGrid();
renderGallery();
currentEditingId = null;
loadCardFromUrl();
