chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'download_pins') {
    const { boardName, pins } = message;
    const tabId = sender.tab.id;
    
    // Start sequential downloading to prevent rate-limiting or browser freeze
    downloadSequence(boardName, pins, tabId);
    
    sendResponse({ status: 'started' });
  }
  return true;
});

async function downloadSequence(boardName, pins, tabId) {
  const sanitizedBoardName = sanitizeFolder(boardName);
  const total = pins.length;
  
  for (let i = 0; i < total; i++) {
    const pin = pins[i];
    
    // Extract the original filename from the CDN URL (e.g. hash.jpg)
    let urlFilename = '';
    try {
      const urlObj = new URL(pin.url);
      urlFilename = urlObj.pathname.split('/').pop();
    } catch (e) {}
    
    // Fallback if URL extraction fails
    if (!urlFilename) {
      const extension = getExtension(pin.url);
      urlFilename = `pin_${pin.id || i + 1}.${extension}`;
    }
    
    const filename = `Pinterest_Downloads/${sanitizedBoardName}/${urlFilename}`;
    
    try {
      await downloadFile(pin.url, filename);
      // Send progress to tab
      chrome.tabs.sendMessage(tabId, {
        action: 'download_progress',
        current: i + 1,
        total: total,
        status: 'downloading'
      }).catch(err => {
        // Ignore error if tab is closed or listener is gone
      });
    } catch (err) {
      console.error('Failed to download:', pin.url, err);
    }
    
    // Short delay to avoid overloading chrome downloads API
    await sleep(200);
  }
  
  chrome.tabs.sendMessage(tabId, {
    action: 'download_progress',
    current: total,
    total: total,
    status: 'completed'
  }).catch(err => {});
}

function downloadFile(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: url,
      filename: filename,
      conflictAction: 'uniquify',
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(downloadId);
      }
    });
  });
}

function sanitizeFolder(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Unnamed Board';
}

function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim().substring(0, 120) || 'pin';
}

function getExtension(url) {
  try {
    const path = new URL(url).pathname;
    const parts = path.split('.');
    const ext = parts[parts.length - 1].toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4'].includes(ext)) {
      return ext;
    }
  } catch (e) {}
  return 'jpg';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
