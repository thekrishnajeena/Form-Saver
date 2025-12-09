// Background service worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('Form Saver extension installed');
  
  // Initialize storage
  chrome.storage.local.get(['protectedSites', 'formData'], (result) => {
    if (!result.protectedSites) {
      chrome.storage.local.set({ protectedSites: [] });
    }
    if (!result.formData) {
      chrome.storage.local.set({ formData: {} });
    }
  });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveFormData') {
    chrome.storage.local.get('formData', (result) => {
      const formData = result.formData || {};
      formData[request.pageId] = request.data;
      chrome.storage.local.set({ formData }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }
  
  if (request.action === 'getFormData') {
    chrome.storage.local.get('formData', (result) => {
      const formData = result.formData || {};
      sendResponse({ data: formData[request.pageId] });
    });
    return true;
  }
});