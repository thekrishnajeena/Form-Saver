// --- FIXED CONTENT SCRIPT ---
(function () {
  const AUTOSAVE_DELAY = 500;
  let autosaveTimer = null;
  let isProtectedSite = false;
  let observerInitialized = false;

  // ---- Utilities ----
function getPageId() {
  const url = new URL(window.location.href);
  // Remove tracking params if needed
  ["utm_source", "utm_medium", "utm_campaign", "fbclid", "gclid"].forEach(p => url.searchParams.delete(p));
  return url.toString(); // full URL including query
}


  // --- XPath fallback for unique identification ---
  function getXPath(el) {
    if (el.id) return `//*[@id="${el.id}"]`;
    if (el === document.body) return "/html/body";
    const ix = Array.from(el.parentNode.children).indexOf(el) + 1;
    return getXPath(el.parentNode) + "/" + el.tagName.toLowerCase() + `[${ix}]`;
  }

  function getFieldId(field) {
    if (field.id) return `id:${field.id}`;
    if (field.name) return `name:${field.name}`;
    return `xpath:${getXPath(field)}`;
  }

  function getAllFormFields() {
    return Array.from(
      document.querySelectorAll(
        'input:not([type="password"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="file"]), textarea, select'
      )
    );
  }

  // ---- Save form data ----
  async function saveFormData() {
    if (!isProtectedSite) return;
    const fields = getAllFormFields();
    const data = {};
    let hasData = false;

    for (const field of fields) {
      let value = null;
      if (field.type === "checkbox") {
        value = field.checked;
        hasData = true;
      } else if (field.type === "radio") {
        value = { checked: field.checked, value: field.value, name: field.name };
        hasData = true;
      } else if (field.tagName === "SELECT") {
        value = { selectedIndex: field.selectedIndex, value: field.value };
        if (field.value) hasData = true;
      } else {
        value = field.value;
        if (value) hasData = true;
      }
      data[getFieldId(field)] = { tag: field.tagName, type: field.type, value };
    }

    if (!hasData) return;
    const pageId = getPageId();
    const { formData = {} } = await chrome.storage.local.get("formData");
    formData[pageId] = { data, savedAt: Date.now(), url: window.location.href };
    await chrome.storage.local.set({ formData });
  }

  // ---- Restore form data ----
  async function restoreFormData(showPrompt = false) {
    const pageId = getPageId();
    const { formData = {} } = await chrome.storage.local.get("formData");
    const saved = formData[pageId];
    if (!saved) {
      if (showPrompt) showNotification("❌ No saved data for this page");
      return;
    }

    const fields = getAllFormFields();
    const savedData = saved.data;
    let restored = 0;

    for (const field of fields) {
      const key = getFieldId(field);
      const savedField = savedData[key];
      if (!savedField) continue;

      try {
        const val = savedField.value;
        if (field.type === "checkbox") {
          field.checked = val;
        } else if (field.type === "radio") {
          if (val.checked && field.value === val.value) field.checked = true;
        } else if (field.tagName === "SELECT") {
          field.value = val.value;
        } else {
          const setter = Object.getOwnPropertyDescriptor(field.__proto__, "value")?.set;
          if (setter) setter.call(field, val || "");
          else field.value = val || "";
        }

        ["input", "change", "blur"].forEach((evt) =>
          field.dispatchEvent(new Event(evt, { bubbles: true }))
        );
        restored++;
      } catch (e) {
        console.warn("Restore failed for field", key, e);
      }
    }

    if (restored > 0) showNotification(`✅ Restored ${restored} fields`);
  }

  // ---- Debounced autosave ----
  function setupAutosave() {
    const saveDebounced = () => {
      clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(saveFormData, AUTOSAVE_DELAY);
    };

    getAllFormFields().forEach((f) => {
      ["input", "change", "keyup"].forEach((ev) =>
        f.addEventListener(ev, saveDebounced, { passive: true })
      );
    });

    window.addEventListener("beforeunload", saveFormData);
  }

  // ---- Notification helper ----
  function showNotification(msg) {
    const box = document.createElement("div");
    Object.assign(box.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      background: "linear-gradient(135deg,#667eea,#764ba2)",
      color: "#fff",
      padding: "12px 20px",
      borderRadius: "10px",
      zIndex: 999999,
      fontFamily: "sans-serif",
      boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
    });
    box.textContent = msg;
    document.body.appendChild(box);
    setTimeout(() => (box.style.opacity = "0"), 2500);
    setTimeout(() => box.remove(), 3000);
  }

  // ---- Floating restore button ----
  function createRestoreButton() {
    if (document.getElementById("form-saver-btn")) return;
    const btn = document.createElement("div");
    btn.id = "form-saver-btn";
    btn.textContent = "Restore Saved Form";
    Object.assign(btn.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      background: "linear-gradient(135deg,#667eea,#764ba2)",
      color: "#fff",
      padding: "12px 18px",
      borderRadius: "24px",
      cursor: "pointer",
      fontSize: "14px",
      zIndex: 999998,
    });
    btn.onclick = () => restoreFormData(true);
    document.body.appendChild(btn);
  }

  // ---- Delayed restore handling ----
  async function tryRestoreWithRetry(attempts = 0) {
    const fields = getAllFormFields();
    if (fields.length === 0 && attempts < 10) {
      setTimeout(() => tryRestoreWithRetry(attempts + 1), 1000);
      return;
    }
    await restoreFormData(false);
  }

  // ---- Initialization ----
  async function init() {
    const { protectedSites = [] } = await chrome.storage.local.get("protectedSites");
    isProtectedSite = protectedSites.includes(location.hostname);
    if (!isProtectedSite) return;

    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", () => createRestoreButton());
    else createRestoreButton();

    setupAutosave();
    tryRestoreWithRetry();

    if (!observerInitialized) {
      observerInitialized = true;
      const obs = new MutationObserver(() => {
        clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(setupAutosave, 1000);
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }

  init();
})();
