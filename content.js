// Content Script for Pinterest Bulk Downloader Extension

// --- Helper Functions ---

// Extracted board link checker
function getBoardDetailsFromUrl(urlStr) {
  try {
    if (!urlStr) return null;
    const url = new URL(urlStr, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    const path = url.pathname;
    const parts = path.split('/').filter(Boolean);
    
    // A board URL has exactly 2 non-empty segments: /[username]/[board-slug]/
    if (parts.length === 2) {
      const excludedFirst = [
        'pin', 'today', 'ideas', 'settings', 'business', 'search', 
        'notifications', 'chats', 'messages', 'homefeed', 'explore', 
        'ad-manager', 'cookie-policy', 'terms', 'privacy', 'about', 
        'offsite', 'oauth', 'videos'
      ];
      const excludedSecond = [
        'saved', 'created', '_saved', '_created', 'followers', 
        'following', 'activity'
      ];
      
      const first = parts[0].toLowerCase();
      const second = parts[1].toLowerCase();
      
      if (!excludedFirst.includes(first) && !excludedSecond.includes(second)) {
        return { username: parts[0], slug: parts[1], path: path };
      }
    }
  } catch (e) {}
  return null;
}

// --- Injection Logic for Hover Download Button ---

function injectDownloadButtons() {
  // Find all links on the page
  const links = document.querySelectorAll('a');
  
  links.forEach(link => {
    // Skip if already processed or has no href
    if (link.dataset.hasBulkDownload === 'true') return;
    const href = link.getAttribute('href');
    if (!href) return;
    
    const details = getBoardDetailsFromUrl(href);
    if (!details) return;
    
    // Mark link as processed
    link.dataset.hasBulkDownload = 'true';
    
    // Find the board card container (the parent element of the link)
    const wrapper = link.parentElement;
    if (!wrapper) return;
    
    wrapper.classList.add('p-board-card-wrapper');
    
    // Create the premium download button
    const dlBtn = document.createElement('button');
    dlBtn.className = 'p-bulk-dl-btn';
    dlBtn.title = `Bulk download pins from: ${details.slug.replace(/-/g, ' ')}`;
    dlBtn.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"></path>
      </svg>
    `;
    
    // Adjust button placement if there is an edit button nearby
    // (This works across all languages by checking if there's any absolute-positioned button on hover inside the wrapper)
    const hasEditBtn = wrapper.querySelector('button[aria-label], div[role="button"][aria-label], button[style*="absolute"], div[style*="absolute"]');
    if (hasEditBtn) {
      dlBtn.style.right = '56px'; // Positioned left of the edit button
    } else {
      dlBtn.style.right = '12px'; // Positioned at the primary bottom-right corner
    }
    
    // Handle download click action
    dlBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const boardUrl = new URL(link.href, window.location.origin);
      boardUrl.searchParams.set('download', 'bulk');
      window.open(boardUrl.toString(), '_blank');
    });
    
    wrapper.appendChild(dlBtn);
  });
}

// --- Bulk Download Overlay Controller (runs in the new board tab) ---

let pinsMap = new Map();
let scrollInterval = null;
let noNewPinsCount = 0;
let lastPinsCount = 0;
let boardName = 'Pinterest Board';
let isDownloaderActive = false;
let isDownloading = false;
let isFeedMode = false;

function initBulkDownloader() {
  injectFloatingLauncher();
  injectSinglePinButtons();
  
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('download') === 'bulk') {
    activateBulkDownloader();
  }
}

function activateBulkDownloader() {
  if (isDownloaderActive) return;
  isDownloaderActive = true;
  
  const fab = document.getElementById('p-fab-launcher');
  if (fab) fab.style.display = 'none';
  
  // Extract board name, search query, or feed title
  const urlParams = new URLSearchParams(window.location.search);
  const searchQuery = urlParams.get('q');
  const path = window.location.pathname;

  const h1 = document.querySelector('h1');
  if (h1 && h1.textContent.trim()) {
    boardName = h1.textContent.trim();
  } else if (searchQuery) {
    boardName = `Search - ${searchQuery}`;
  } else if (path === '/' || path.includes('/homefeed')) {
    boardName = 'Home Feed';
  } else {
    boardName = document.title.split('|')[0].trim() || 'Pinterest Feed';
  }

  // Detect if this is a Home Feed / Search Feed (where pins default to deselected)
  isFeedMode = (path === '/' || path.includes('/homefeed') || boardName === 'Home Feed' || Boolean(searchQuery));

  // Reset state for new scan session
  pinsMap.clear();
  noNewPinsCount = 0;
  lastPinsCount = 0;

  // Create overlay & start scanning
  createDownloaderOverlay();
  startScanning();
  injectCheckboxes();
}

function injectSinglePinButtons() {
  const pinLinks = document.querySelectorAll('a[href*="/pin/"]');
  pinLinks.forEach(link => {
    if (link.dataset.hasSinglePinDownload === 'true') return;
    const href = link.getAttribute('href');
    const idMatch = href.match(/\/pin\/(\d+)/);
    if (!idMatch) return;
    const pinId = idMatch[1];
    
    const img = link.querySelector('img');
    if (!img || !img.src) return;

    link.dataset.hasSinglePinDownload = 'true';

    // Find closest container wrapper
    let cardWrapper = link;
    if (link.parentElement && link.parentElement.tagName !== 'BODY') {
      link.parentElement.classList.add('p-single-pin-wrapper');
      cardWrapper = link.parentElement;
    } else {
      link.classList.add('p-single-pin-wrapper');
    }

    const dlBtn = document.createElement('button');
    dlBtn.className = 'p-single-pin-dl-btn';
    dlBtn.title = 'Download High-Res Pin';
    dlBtn.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"></path>
      </svg>
    `;

    dlBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const originalUrl = img.src.replace(/\/\d+x\//, '/originals/');
      const title = img.alt || `pin_${pinId}`;

      // Quick visual download indicator feedback
      dlBtn.style.backgroundColor = '#4caf50';
      dlBtn.style.color = '#ffffff';

      chrome.runtime.sendMessage({
        action: 'download_pins',
        boardName: 'Quick Downloads',
        pins: [{ id: pinId, title: title, url: originalUrl, selected: true }]
      });

      setTimeout(() => {
        dlBtn.style.backgroundColor = '';
        dlBtn.style.color = '';
      }, 1500);
    });

    cardWrapper.appendChild(dlBtn);
  });
}

function injectFloatingLauncher() {
  if (document.getElementById('p-fab-launcher')) return;
  
  const fab = document.createElement('button');
  fab.id = 'p-fab-launcher';
  fab.className = 'p-fab-launcher';
  fab.title = 'Bulk Download Pins on this page';
  fab.innerHTML = `
    <svg viewBox="0 0 24 24">
      <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"></path>
    </svg>
    <span>Bulk Download</span>
  `;
  
  if (isDownloaderActive) {
    fab.style.display = 'none';
  }
  
  fab.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    activateBulkDownloader();
  });
  
  document.body.appendChild(fab);
}

let isAutoScrolling = true;

function createDownloaderOverlay() {
  isAutoScrolling = true;
  const overlay = document.createElement('div');
  overlay.className = 'p-dl-overlay';
  overlay.innerHTML = `
    <div class="p-dl-header">
      <h3 class="p-dl-title">Bulk Downloader</h3>
      <button class="p-dl-close" id="p-dl-close-btn" title="Close Downloader">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path>
        </svg>
      </button>
    </div>
    <div class="p-dl-body">
      <div class="p-dl-board-info">Feed/Board: <strong>${boardName}</strong></div>
      <div class="p-dl-stats-row">
        <span>Selected: <strong id="p-dl-pin-count">0 / 0</strong></span>
        <div class="p-dl-loader-container" id="p-dl-loader">
          <span>Scanning board...</span>
        </div>
      </div>
      <div class="p-dl-action-row">
        <button class="p-dl-btn-sub" id="p-dl-select-all-btn">Select All</button>
        <button class="p-dl-btn-sub" id="p-dl-deselect-all-btn">Deselect All</button>
        <button class="p-dl-btn-sub" id="p-dl-toggle-scroll-btn">Pause Auto-Scroll</button>
      </div>
      <div class="p-dl-progress-track">
        <div class="p-dl-progress-bar" id="p-dl-progress-bar"></div>
      </div>
    </div>
    <div class="p-dl-footer">
      <button class="p-dl-btn-primary" id="p-dl-start-btn">Download 0 Pins</button>
      <button class="p-dl-btn-secondary" id="p-dl-stop-btn">Stop & Close</button>
    </div>
  `;
  document.body.appendChild(overlay);
  
  // Add listeners
  document.getElementById('p-dl-close-btn').addEventListener('click', () => {
    stopScanning();
    isDownloaderActive = false;
    isDownloading = false;
    removeAllCheckboxes();
    overlay.remove();
    const fab = document.getElementById('p-fab-launcher');
    if (fab) fab.style.display = 'flex';
  });
  
  const stopBtn = document.getElementById('p-dl-stop-btn');
  stopBtn.addEventListener('click', () => {
    stopScanning();
    isDownloaderActive = false;
    isDownloading = false;
    removeAllCheckboxes();
    overlay.remove();
    const fab = document.getElementById('p-fab-launcher');
    if (fab) fab.style.display = 'flex';
  });
  
  document.getElementById('p-dl-select-all-btn').addEventListener('click', () => {
    pinsMap.forEach(pin => { pin.selected = true; });
    injectCheckboxes();
    updateStatsUI();
  });

  document.getElementById('p-dl-deselect-all-btn').addEventListener('click', () => {
    pinsMap.forEach(pin => { pin.selected = false; });
    injectCheckboxes();
    updateStatsUI();
  });

  const toggleScrollBtn = document.getElementById('p-dl-toggle-scroll-btn');
  toggleScrollBtn.addEventListener('click', () => {
    if (isAutoScrolling) {
      isAutoScrolling = false;
      stopScanning(false);
      toggleScrollBtn.textContent = 'Resume Auto-Scroll';
    } else {
      isAutoScrolling = true;
      startScanning();
      toggleScrollBtn.textContent = 'Pause Auto-Scroll';
      const loader = document.getElementById('p-dl-loader');
      if (loader) loader.innerHTML = '<span>Scanning feed...</span>';
    }
  });

  const startBtn = document.getElementById('p-dl-start-btn');
  startBtn.addEventListener('click', () => {
    stopScanning();
    const selectedPins = Array.from(pinsMap.values()).filter(p => p.selected);
    if (selectedPins.length === 0) {
      alert('No pins selected to download!');
      return;
    }
    
    // Disable buttons during download
    isDownloading = true;
    startBtn.disabled = true;
    startBtn.textContent = 'Preparing...';
    stopBtn.disabled = true;
    
    // Trigger bulk download in background worker
    chrome.runtime.sendMessage({
      action: 'download_pins',
      boardName: boardName,
      pins: selectedPins
    });
  });
}

function updateStatsUI() {
  const total = pinsMap.size;
  const selected = Array.from(pinsMap.values()).filter(p => p.selected).length;
  
  const countEl = document.getElementById('p-dl-pin-count');
  if (countEl) {
    countEl.textContent = `${selected} / ${total}`;
  }
  
  const startBtn = document.getElementById('p-dl-start-btn');
  if (startBtn && !isDownloading) {
    startBtn.textContent = `Download ${selected} Pins`;
    startBtn.disabled = selected === 0;
  }
}

function injectCheckboxes() {
  if (!isDownloaderActive) return;
  
  const pinLinks = document.querySelectorAll('a[href*="/pin/"]');
  pinLinks.forEach(link => {
    const href = link.getAttribute('href');
    const idMatch = href.match(/\/pin\/(\d+)/);
    if (!idMatch) return;
    const pinId = idMatch[1];
    
    const img = link.querySelector('img');
    if (!img || !img.src) return;
    
    const originalUrl = img.src.replace(/\/\d+x\//, '/originals/');
    const title = img.alt || `pin_${pinId}`;
    
    // 1. Ensure pin details exist in the master map (Feed mode defaults to deselected)
    if (!pinsMap.has(originalUrl)) {
      pinsMap.set(originalUrl, {
        id: pinId,
        title: title,
        url: originalUrl,
        selected: isFeedMode ? false : true
      });
    }
    
    const pinData = pinsMap.get(originalUrl);
    
    // 2. Inject or re-inject checkbox if missing
    let checkbox = link.querySelector('.p-pin-checkbox');
    if (!checkbox) {
      link.style.position = 'relative';
      
      checkbox = document.createElement('div');
      checkbox.className = 'p-pin-checkbox';
      checkbox.innerHTML = `
        <svg viewBox="0 0 24 24">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"></path>
        </svg>
      `;
      
      // Checkbox click handler
      checkbox.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        pinData.selected = !pinData.selected;
        if (pinData.selected) {
          checkbox.classList.remove('unchecked');
          link.classList.remove('p-deselected-pin');
        } else {
          checkbox.classList.add('unchecked');
          if (!isFeedMode) {
            link.classList.add('p-deselected-pin');
          }
        }
        updateStatsUI();
      });
      
      link.appendChild(checkbox);
    }
    
    // 3. Synchronize element visual state with stored data (critical for React DOM updates)
    if (pinData.selected) {
      checkbox.classList.remove('unchecked');
      link.classList.remove('p-deselected-pin');
    } else {
      checkbox.classList.add('unchecked');
      if (!isFeedMode) {
        link.classList.add('p-deselected-pin');
      }
    }
  });
  
  // Refresh stats counts
  updateStatsUI();
}

function removeAllCheckboxes() {
  const checkboxes = document.querySelectorAll('.p-pin-checkbox');
  checkboxes.forEach(cb => cb.remove());
  
  const deselected = document.querySelectorAll('.p-deselected-pin');
  deselected.forEach(el => {
    el.classList.remove('p-deselected-pin');
  });
  
  const links = document.querySelectorAll('a[data-has-checkbox]');
  links.forEach(l => {
    l.removeAttribute('data-has-checkbox');
  });
}

function startScanning() {
  scrollInterval = setInterval(() => {
    // Scroll page down smoothly to load more items
    window.scrollBy({
      top: 600,
      behavior: 'smooth'
    });
    
    // Inject checkboxes on the newly loaded elements
    injectCheckboxes();
    
    const currentCount = pinsMap.size;
    // Auto-stop scanning if we scroll multiple times without discovering new pins
    if (currentCount === lastPinsCount) {
      noNewPinsCount++;
      if (noNewPinsCount >= 10) { // No new pins for 10 seconds (reached end or slow loading)
        stopScanning(true);
      }
    } else {
      noNewPinsCount = 0;
      lastPinsCount = currentCount;
    }
  }, 1000);
}

function stopScanning(finished = false) {
  if (scrollInterval) {
    clearInterval(scrollInterval);
    scrollInterval = null;
  }
  
  const loader = document.getElementById('p-dl-loader');
  if (loader) {
    if (finished) {
      loader.innerHTML = '<span>Scan complete</span>';
    } else if (!isAutoScrolling) {
      loader.innerHTML = '<span>Auto-scroll paused</span>';
    } else {
      loader.innerHTML = '<span>Scan stopped</span>';
    }
  }
}

// --- Listen to Download Progress from Background Service Worker ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'download_progress') {
    const { current, total, status } = message;
    
    const countEl = document.getElementById('p-dl-pin-count');
    if (countEl) {
      countEl.textContent = `${current} / ${total} downloaded`;
    }
    
    const progressBar = document.getElementById('p-dl-progress-bar');
    if (progressBar) {
      const pct = Math.round((current / total) * 100);
      progressBar.style.width = `${pct}%`;
    }
    
    const loader = document.getElementById('p-dl-loader');
    if (loader) {
      loader.innerHTML = `<span>Downloading pins...</span>`;
    }
    
    if (status === 'completed') {
      if (loader) {
        loader.innerHTML = '<span style="color: #4caf50; font-weight: bold;">Completed!</span>';
      }
      const startBtn = document.getElementById('p-dl-start-btn');
      if (startBtn) {
        startBtn.textContent = 'Completed!';
        startBtn.disabled = true;
        startBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        startBtn.style.color = '#4caf50';
      }
      const stopBtn = document.getElementById('p-dl-stop-btn');
      if (stopBtn) {
        stopBtn.disabled = false;
        stopBtn.textContent = 'Close';
      }
    }
  }
});

// --- Initialize content scripts ---

let debounceTimeout = null;

// Set up MutationObserver to dynamically inject buttons and checkboxes on DOM changes safely
const observer = new MutationObserver(() => {
  // Throttle updates using debounce to maintain 60 FPS and avoid CPU hogging
  if (debounceTimeout) return;
  
  debounceTimeout = setTimeout(() => {
    // Temporarily disconnect the observer to avoid infinite loops from our own DOM modifications
    observer.disconnect();
    
    injectDownloadButtons();
    injectSinglePinButtons();
    injectFloatingLauncher();
    if (isDownloaderActive) {
      injectCheckboxes();
    }
    
    // Re-observe once our changes are finished
    observer.observe(document.body, { childList: true, subtree: true });
    debounceTimeout = null;
  }, 150); // 150ms throttle delay
});

// Start observing
observer.observe(document.body, { childList: true, subtree: true });

// Initial run
setTimeout(() => {
  injectDownloadButtons();
  injectSinglePinButtons();
  initBulkDownloader();
}, 1500); // Give the page a moment to load and hydrate its state
