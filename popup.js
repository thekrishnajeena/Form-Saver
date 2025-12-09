// Get current tab URL
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Get domain from URL
function getDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
}

// Update UI
async function updateUI() {
  const tab = await getCurrentTab();
  const domain = getDomain(tab.url);
  
  document.getElementById('currentUrl').textContent = domain;
  
  // Get protected sites
  const { protectedSites = [], formData = {} } = await chrome.storage.local.get(['protectedSites', 'formData']);
  
  const isProtected = protectedSites.includes(domain);
  const toggleBtn = document.getElementById('toggleBtn');
  const statusText = document.getElementById('statusText');
  
  if (isProtected) {
    toggleBtn.classList.add('active');
    statusText.textContent = 'Enabled';
  } else {
    toggleBtn.classList.remove('active');
    statusText.textContent = 'Disabled';
  }
  
  // Update stats
  document.getElementById('sitesCount').textContent = protectedSites.length;
  
  const formsCount = Object.keys(formData).filter(key => {
    return protectedSites.some(site => key.includes(site));
  }).length;
  document.getElementById('formsCount').textContent = formsCount;
  
  // Update sites list
  const sitesList = document.getElementById('sitesList');
  if (protectedSites.length === 0) {
    sitesList.innerHTML = '<div class="empty-state">No sites protected yet</div>';
  } else {
    sitesList.innerHTML = protectedSites.map(site => `
      <div class="site-item">
        <span class="site-name">${site}</span>
        <button class="remove-btn" data-site="${site}">Remove</button>
      </div>
    `).join('');
    
    // Add remove listeners
    document.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const site = btn.getAttribute('data-site');
        const updatedSites = protectedSites.filter(s => s !== site);
        await chrome.storage.local.set({ protectedSites: updatedSites });
        updateUI();
      });
    });
  }
}

// Toggle protection for current site
document.getElementById('toggleBtn').addEventListener('click', async () => {
  const tab = await getCurrentTab();
  const domain = getDomain(tab.url);
  
  const { protectedSites = [] } = await chrome.storage.local.get('protectedSites');
  
  if (protectedSites.includes(domain)) {
    const updatedSites = protectedSites.filter(s => s !== domain);
    await chrome.storage.local.set({ protectedSites: updatedSites });
  } else {
    protectedSites.push(domain);
    await chrome.storage.local.set({ protectedSites });
  }
  
  updateUI();
});

// Add current site
document.getElementById('addSiteBtn').addEventListener('click', async () => {
  const tab = await getCurrentTab();
  const domain = getDomain(tab.url);
  
  const { protectedSites = [] } = await chrome.storage.local.get('protectedSites');
  
  if (!protectedSites.includes(domain)) {
    protectedSites.push(domain);
    await chrome.storage.local.set({ protectedSites });
    updateUI();
  }
});

// Clear current site data
document.getElementById('clearCurrentBtn').addEventListener('click', async () => {
  if (!confirm('Clear saved form data for this site?')) return;
  
  const tab = await getCurrentTab();
  const domain = getDomain(tab.url);
  
  const { formData = {} } = await chrome.storage.local.get('formData');
  
  // Remove all entries for this domain
  Object.keys(formData).forEach(key => {
    if (key.includes(domain)) {
      delete formData[key];
    }
  });
  
  await chrome.storage.local.set({ formData });
  updateUI();
});

// Clear all data
document.getElementById('clearAllBtn').addEventListener('click', async () => {
  if (!confirm('Clear all protected sites and saved form data? This cannot be undone!')) return;
  
  await chrome.storage.local.clear();
  updateUI();
});

// Initialize
updateUI();