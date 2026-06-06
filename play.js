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

function mulberry32(a) {
  return function () {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

function seededShuffle(array, randomFn) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function applyTheme(themeName) {
  const existingLink = document.getElementById('theme-stylesheet');
  if (existingLink) {
    existingLink.remove();
  }
  
  if (themeName && themeName !== 'default') {
    const link = document.createElement('link');
    link.id = 'theme-stylesheet';
    link.rel = 'stylesheet';
    link.href = `themes/${themeName}.css`;
    document.head.appendChild(link);
    document.body.className = document.body.className.replace(/\btheme-\S+/g, '');
    document.body.classList.add(`theme-${themeName}`);
  } else {
    document.body.className = document.body.className.replace(/\btheme-\S+/g, '');
  }
}

const SHUFFLE_MODES = ['none', 'everything', 'rows', 'within-rows'];

const playTitle = document.getElementById('play-title');
const playDesc = document.getElementById('play-desc');
const bingoBoard = document.getElementById('bingo-board');

const btnEditBoard = document.getElementById('btn-edit-board');
const btnResetBoard = document.getElementById('btn-reset-board');
const btnToggleObsPreview = document.getElementById('btn-toggle-obs-preview');
const btnSharePlay = document.getElementById('btn-share-play');

const shareDialog = document.getElementById('share-dialog');
const shareUrlInput = document.getElementById('share-url-input');
const btnCopyUrl = document.getElementById('btn-copy-url');
const btnCloseDialog = document.getElementById('btn-close-dialog');

let cardData = null;
let shuffledIndices = [];
let markedState = {};
let storageKey = '';
let cardCompressedStr = '';
let seedVal = 0;

async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  cardCompressedStr = urlParams.get('c');

  if (!cardCompressedStr) {
    playTitle.textContent = 'No Board Loaded';
    playDesc.textContent = 'Please generate a play link from the dashboard editor.';
    bingoBoard.innerHTML = '<div style="grid-column: span 5; text-align: center; color: var(--text-muted); padding: 3rem 0;">No board layout found.</div>';
    return;
  }

  if (!urlParams.has('seed')) {
    const randomSeed = Math.floor(Math.random() * 1000000);
    urlParams.set('seed', randomSeed);
    window.location.replace(window.location.pathname + '?' + urlParams.toString() + window.location.hash);
    return;
  }
  seedVal = parseInt(urlParams.get('seed'), 10) || 0;

  if (urlParams.get('obs') === 'true') {
    document.body.classList.add('obs-mode');
  }

  const theme = urlParams.get('theme');
  applyTheme(theme);

  const size = urlParams.get('size');
  if (size) {
    const wrapper = document.querySelector('.bingo-board-wrapper');
    if (wrapper) {
      wrapper.style.width = size;
      wrapper.style.height = size;
      wrapper.style.maxWidth = 'none';
      wrapper.style.maxHeight = 'none';
    }
  }

  const fontsize = urlParams.get('fontsize');
  if (fontsize) {
    document.documentElement.style.setProperty('--cell-font-size-override', fontsize);
  }

  try {
    const decompressed = await decompressData(cardCompressedStr);
    const compact = JSON.parse(decompressed);

    cardData = {
      title: compact[0],
      description: compact[1],
      freeSpace: compact[2] === 1,
      shuffleMode: SHUFFLE_MODES[compact[3]] || 'everything',
      tiles: compact.slice(4)
    };

    playTitle.textContent = cardData.title;
    playDesc.textContent = cardData.description || 'Mark items as they happen!';

    calculateShuffle();

    const cardHash = hashCode(cardCompressedStr);
    storageKey = `bingo_state_${cardHash}_${seedVal}`;

    loadMarkedState();

    renderGrid();
  } catch (err) {
    console.error(err);
    playTitle.textContent = 'Error Loading Board';
    playDesc.textContent = 'Failed to decompress the card layout. Link might be corrupted.';
  }
}

function calculateShuffle() {
  const size = 25;
  const originalIndices = Array.from({ length: size }, (_, i) => i);
  const randomFn = mulberry32(seedVal);

  if (cardData.shuffleMode === 'none') {
    shuffledIndices = originalIndices;
    return;
  }

  if (cardData.shuffleMode === 'everything') {
    if (cardData.freeSpace) {
      const shufflable = originalIndices.filter(i => i !== 12);
      const shuffled = seededShuffle(shufflable, randomFn);

      shuffledIndices = [];
      let shuffIdx = 0;
      for (let i = 0; i < size; i++) {
        if (i === 12) {
          shuffledIndices.push(12);
        } else {
          shuffledIndices.push(shuffled[shuffIdx++]);
        }
      }
    } else {
      shuffledIndices = seededShuffle(originalIndices, randomFn);
    }
    return;
  }

  if (cardData.shuffleMode === 'rows') {
    const rowBlocks = [
      originalIndices.slice(0, 5),   // Row 0
      originalIndices.slice(5, 10),  // Row 1
      originalIndices.slice(10, 15), // Row 2
      originalIndices.slice(15, 20), // Row 3
      originalIndices.slice(20, 25)  // Row 4
    ];

    if (cardData.freeSpace) {
      const rowsToShuffle = [rowBlocks[0], rowBlocks[1], rowBlocks[3], rowBlocks[4]];
      const shuffledRows = seededShuffle(rowsToShuffle, randomFn);

      const finalRows = [
        shuffledRows[0],
        shuffledRows[1],
        rowBlocks[2],
        shuffledRows[2],
        shuffledRows[3]
      ];

      shuffledIndices = finalRows.flat();
    } else {
      const shuffledRows = seededShuffle(rowBlocks, randomFn);
      shuffledIndices = shuffledRows.flat();
    }
    return;
  }

  if (cardData.shuffleMode === 'within-rows') {
    const rowBlocks = [
      originalIndices.slice(0, 5),   // Row 0
      originalIndices.slice(5, 10),  // Row 1
      originalIndices.slice(10, 15), // Row 2
      originalIndices.slice(15, 20), // Row 3
      originalIndices.slice(20, 25)  // Row 4
    ];

    const finalRows = rowBlocks.map((row, rowIdx) => {
      if (cardData.freeSpace && rowIdx === 2) {
        const rowShufflable = row.filter((_, idx) => idx !== 2);
        const shuffledRow = seededShuffle(rowShufflable, randomFn);
        return [
          shuffledRow[0],
          shuffledRow[1],
          row[2],
          shuffledRow[2],
          shuffledRow[3]
        ];
      } else {
        return seededShuffle(row, randomFn);
      }
    });

    shuffledIndices = finalRows.flat();
  }
}

function renderGrid() {
  bingoBoard.innerHTML = '';

  for (let displayIdx = 0; displayIdx < 25; displayIdx++) {
    const origIdx = shuffledIndices[displayIdx];
    const text = cardData.tiles[origIdx] || '';

    const cellEl = document.createElement('div');
    cellEl.className = 'bingo-cell';
    cellEl.dataset.index = displayIdx;

    const stampOverlay = document.createElement('div');
    stampOverlay.className = 'stamp-overlay';
    stampOverlay.innerHTML = `
      <svg viewBox="0 0 24 24">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
    cellEl.appendChild(stampOverlay);

    const contentEl = document.createElement('div');
    contentEl.className = 'bingo-cell-content';
    contentEl.textContent = text;
    cellEl.appendChild(contentEl);

    if (markedState[displayIdx]) {
      cellEl.classList.add('marked');
    }

    cellEl.addEventListener('click', () => toggleCell(displayIdx, cellEl));

    bingoBoard.appendChild(cellEl);
  }
}

function toggleCell(displayIdx, cellEl) {
  markedState[displayIdx] = !markedState[displayIdx];

  if (markedState[displayIdx]) {
    cellEl.classList.add('marked');
  } else {
    cellEl.classList.remove('marked');
  }

  saveMarkedState();
}

function loadMarkedState() {
  try {
    markedState = JSON.parse(localStorage.getItem(storageKey)) || {};
  } catch (e) {
    markedState = {};
  }

  if (cardData.freeSpace) {
    const centerDisplayIdx = shuffledIndices.indexOf(12);
    if (centerDisplayIdx !== -1 && markedState[centerDisplayIdx] === undefined) {
      markedState[centerDisplayIdx] = true;
    }
  }
}

function saveMarkedState() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(markedState));
  } catch (e) {
    console.error('Failed to save state to localStorage:', e);
  }
}

function resetCard() {
  markedState = {};
  if (cardData.freeSpace) {
    const centerDisplayIdx = shuffledIndices.indexOf(12);
    if (centerDisplayIdx !== -1) {
      markedState[centerDisplayIdx] = true;
    }
  }
  saveMarkedState();
  renderGrid();
}

btnResetBoard.addEventListener('click', () => {
  if (confirm('Are you sure you want to reset this card? This clears all marked boxes.')) {
    resetCard();
  }
});

btnEditBoard.addEventListener('click', () => {
  const baseDir = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
  const urlParams = new URLSearchParams(window.location.search);
  let editUrl = `${baseDir}/index.html?c=${cardCompressedStr}`;
  const theme = urlParams.get('theme');
  const size = urlParams.get('size');
  const fontsize = urlParams.get('fontsize');
  if (theme) editUrl += `&theme=${theme}`;
  if (size) editUrl += `&size=${encodeURIComponent(size)}`;
  if (fontsize) editUrl += `&fontsize=${encodeURIComponent(fontsize)}`;
  window.location.href = editUrl;
});

btnToggleObsPreview.addEventListener('click', () => {
  document.body.classList.toggle('obs-mode');
});

function showShareModal(url) {
  shareUrlInput.value = url;
  shareDialog.classList.add('active');
}

btnSharePlay.addEventListener('click', () => {
  const newSeed = Math.floor(Math.random() * 1000000);
  const baseDir = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
  const urlParams = new URLSearchParams(window.location.search);
  let shareUrl = `${baseDir}/play.html?c=${cardCompressedStr}&seed=${newSeed}`;

  const theme = urlParams.get('theme');
  const size = urlParams.get('size');
  const fontsize = urlParams.get('fontsize');
  if (theme) shareUrl += `&theme=${theme}`;
  if (size) shareUrl += `&size=${encodeURIComponent(size)}`;
  if (fontsize) shareUrl += `&fontsize=${encodeURIComponent(fontsize)}`;

  showShareModal(shareUrl);
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

btnCloseDialog.addEventListener('click', () => {
  shareDialog.classList.remove('active');
});

shareDialog.addEventListener('click', (e) => {
  if (e.target === shareDialog) {
    shareDialog.classList.remove('active');
  }
});

init();
