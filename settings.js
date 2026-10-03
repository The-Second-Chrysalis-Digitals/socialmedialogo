(() => {
  const STORAGE_KEY = "social-photo-exporter:guest-settings:v1";
  const portuguese = document.documentElement.lang === "pt-PT";
  const text = portuguese ? {
    title: "Definições", close: "Fechar definições", remember: "Guardar predefinições neste dispositivo",
    photoSize: "Formato de fotografia", format: "Tipo de ficheiro", fit: "Enquadramento", videoSize: "Formato de vídeo",
    transition: "Transição", effect: "Efeito de cor", photoTime: "Tempo por fotografia", transitionTime: "Duração da transição",
    faceAware: "Proteger rostos", frame: "Moldura APCM", loop: "Repetir música", fade: "Entrada e saída suaves",
    volume: "Volume da música", cover: "Preencher", contain: "Imagem inteira", apply: "Aplicar", reset: "Repor predefinições",
    export: "Exportar definições", import: "Importar definições", saved: "Predefinições guardadas neste dispositivo.",
    session: "Definições aplicadas apenas a esta sessão.", failed: "Não foi possível guardar as definições neste dispositivo.",
    invalid: "O ficheiro de definições não é válido.", restored: "Predefinições repostas.", imported: "Definições importadas.",
    importLabel: "Ficheiro de definições",
  } : {
    title: "Settings", close: "Close settings", remember: "Remember defaults on this device",
    photoSize: "Photo size", format: "File type", fit: "Photo fit", videoSize: "Video size",
    transition: "Transition", effect: "Colour effect", photoTime: "Photo time", transitionTime: "Transition time",
    faceAware: "Protect faces", frame: "APCM frame", loop: "Loop music", fade: "Fade in and out",
    volume: "Music volume", cover: "Fill", contain: "Full image", apply: "Apply", reset: "Restore defaults",
    export: "Export settings", import: "Import settings", saved: "Defaults saved on this device.",
    session: "Settings applied for this session only.", failed: "Settings could not be saved on this device.",
    invalid: "This settings file is not valid.", restored: "Defaults restored.", imported: "Settings imported.",
    importLabel: "Settings file",
  };
  const keys = ["presetId", "fit", "frameEnabled", "logoPosition", "logoSize", "logoOpacity", "logoRotation",
    "faceAware", "format", "background", "transparent", "jpegQuality", "videoPresetId", "videoTransition",
    "videoColourEffect", "musicVolume", "musicLoop", "musicFade", "videoPhotoDuration", "videoTransitionDuration"];
  const capture = () => Object.fromEntries(keys.map(key => [key, key === "logoPosition" ? { ...state[key] } : state[key]]));
  const defaults = capture();
  const enums = {
    presetId: presets.map(preset => preset.id), fit: ["cover", "contain"], format: ["png", "jpeg"],
    videoPresetId: Object.keys(VIDEO_FORMATS), videoTransition: Array.from(els.videoTransition.options, option => option.value),
    videoColourEffect: Object.keys(VIDEO_COLOUR_FILTERS), videoPhotoDuration: [1.5, 2, 3, 4], videoTransitionDuration: [0.4, 0.6, 1],
  };
  const ranges = { logoSize: [0.05, 0.55], logoOpacity: [0.1, 1], logoRotation: [-45, 45], jpegQuality: [0.6, 1], musicVolume: [0, 1] };
  let remember = true;
  let storageError = false;
  let timer;

  function validate(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(text.invalid);
    const result = { ...defaults, logoPosition: { ...defaults.logoPosition } };
    for (const key of keys) {
      if (!(key in value)) continue;
      const item = value[key];
      if (enums[key]) {
        if (!enums[key].includes(item)) throw new Error(text.invalid);
      } else if (ranges[key]) {
        if (!Number.isFinite(item) || item < ranges[key][0] || item > ranges[key][1]) throw new Error(text.invalid);
      } else if (key === "logoPosition") {
        if (!item || !Number.isFinite(item.x) || !Number.isFinite(item.y) || item.x < -0.2 || item.x > 1.2 || item.y < -0.2 || item.y > 1.2) throw new Error(text.invalid);
      } else if (key === "background") {
        if (typeof item !== "string" || !/^#[0-9a-f]{6}$/i.test(item)) throw new Error(text.invalid);
      } else if (typeof item !== "boolean") throw new Error(text.invalid);
      result[key] = key === "logoPosition" ? { x: item.x, y: item.y } : item;
    }
    if (result.format === "jpeg") result.transparent = false;
    return result;
  }

  function apply(settings) {
    const videoChanged = state.videoPresetId !== settings.videoPresetId;
    Object.assign(state, settings);
    clearReadyDownload();
    syncControls();
    renderPreview();
    renderOrderPreview();
    if (videoChanged) setupVideoEncoder();
  }

  const dialog = document.createElement("dialog");
  dialog.id = "settingsDialog";
  dialog.className = "settings-dialog";
  dialog.setAttribute("aria-labelledby", "settingsTitle");
  dialog.innerHTML = `<form id="settingsForm">
    <header class="settings-header"><h2 id="settingsTitle">${text.title}</h2>
      <button class="icon-button" id="closeSettings" type="button" title="${text.close}" aria-label="${text.close}"><svg><use href="#icon-x"></use></svg></button>
    </header>
    <div class="settings-content">
      <label class="settings-remember"><input id="settingsRemember" type="checkbox" checked><span>${text.remember}</span></label>
      <div class="settings-grid" id="settingsFields"></div>
      <div class="settings-checks" id="settingsChecks"></div>
      <label class="range-field"><span>${text.volume}</span><input id="settingsVolume" type="range" min="0" max="100" value="70"><output id="settingsVolumeValue">70%</output></label>
      <div class="mini-status" id="settingsStatus" role="status"></div>
    </div>
    <footer class="settings-footer">
      <button class="secondary-button" id="resetSettings" type="button">${text.reset}</button>
      <button class="secondary-button" id="exportSettings" type="button">${text.export}</button>
      <button class="secondary-button" id="importSettings" type="button">${text.import}</button>
      <button class="primary-button" type="submit">${text.apply}</button>
    </footer>
    <input id="settingsFile" type="file" accept="application/json,.json" aria-label="${text.importLabel}">
  </form>`;
  document.body.append(dialog);
  const status = dialog.querySelector("#settingsStatus");
  const controls = new Map();
  const fields = dialog.querySelector("#settingsFields");
  const specs = [
    ["presetId", text.photoSize, presets.map(preset => [preset.id, preset.name])],
    ["format", text.format, [["png", "PNG"], ["jpeg", "JPEG"]]],
    ["fit", text.fit, [["cover", text.cover], ["contain", text.contain]]],
    ["videoPresetId", text.videoSize, Object.entries(VIDEO_FORMATS).map(([id, format]) => [id, format.ratio])],
    ["videoTransition", text.transition, Array.from(els.videoTransition.options, option => [option.value, option.textContent])],
    ["videoColourEffect", text.effect, Array.from(els.videoColourEffect.options, option => [option.value, option.textContent])],
    ["videoPhotoDuration", text.photoTime, Array.from(els.videoPhotoDuration.options, option => [option.value, option.textContent])],
    ["videoTransitionDuration", text.transitionTime, Array.from(els.videoTransitionDuration.options, option => [option.value, option.textContent])],
  ];
  for (const [key, title, options] of specs) {
    const label = document.createElement("label"); label.className = "settings-field";
    const span = document.createElement("span"); span.textContent = title;
    const select = document.createElement("select"); select.id = `settings-${key}`;
    for (const [value, title] of options) select.add(new Option(title, value));
    label.append(span, select); fields.append(label); controls.set(key, select);
  }
  for (const [key, title] of [["faceAware", text.faceAware], ["frameEnabled", text.frame], ["musicLoop", text.loop], ["musicFade", text.fade]]) {
    const label = document.createElement("label"); const input = document.createElement("input");
    input.type = "checkbox"; input.id = `settings-${key}`;
    const span = document.createElement("span"); span.textContent = title;
    label.append(input, span); dialog.querySelector("#settingsChecks").append(label); controls.set(key, input);
  }

  function save() {
    clearTimeout(timer);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, remember, ...(remember ? { settings: capture() } : {}) }));
      storageError = false;
      status.textContent = remember ? text.saved : text.session;
    } catch { storageError = true; status.textContent = text.failed; }
  }

  function fill() {
    for (const [key, input] of controls) {
      if (input.type === "checkbox") input.checked = state[key];
      else input.value = String(state[key]);
    }
    dialog.querySelector("#settingsRemember").checked = remember;
    dialog.querySelector("#settingsVolume").value = String(Math.round(state.musicVolume * 100));
    dialog.querySelector("#settingsVolumeValue").textContent = `${Math.round(state.musicVolume * 100)}%`;
    dialog.querySelector("#settings-videoTransitionDuration").disabled = state.videoTransition === "cut";
    status.textContent = storageError ? text.failed : remember ? text.saved : text.session;
  }

  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (stored?.version === 1 && typeof stored.remember === "boolean") {
      remember = stored.remember;
      if (remember && stored.settings) apply(validate(stored.settings));
    }
  } catch { status.textContent = text.invalid; }

  document.querySelector("#openSettings").addEventListener("click", () => {
    if (state.exporting || state.loadingPhotos || state.musicLoading || state.scanInProgress) return;
    fill(); dialog.querySelector(".settings-content").scrollTop = 0; dialog.showModal();
  });
  dialog.querySelector("#closeSettings").addEventListener("click", () => dialog.close());
  dialog.querySelector("#settings-videoTransition").addEventListener("change", event => {
    controls.get("videoTransitionDuration").disabled = event.target.value === "cut";
  });
  dialog.querySelector("#settingsVolume").addEventListener("input", event => {
    dialog.querySelector("#settingsVolumeValue").textContent = `${event.target.value}%`;
  });
  function readDraft() {
    const value = capture();
    for (const [key, input] of controls) value[key] = input.type === "checkbox" ? input.checked : typeof defaults[key] === "number" ? Number(input.value) : input.value;
    value.musicVolume = Number(dialog.querySelector("#settingsVolume").value) / 100;
    return validate(value);
  }
  dialog.querySelector("#settingsForm").addEventListener("submit", event => {
    event.preventDefault();
    const value = readDraft();
    remember = dialog.querySelector("#settingsRemember").checked;
    apply(value); save(); setStatus(status.textContent); dialog.close();
  });
  dialog.querySelector("#resetSettings").addEventListener("click", () => {
    apply(validate(defaults)); save(); fill(); status.textContent = text.restored; setStatus(text.restored);
  });
  dialog.querySelector("#exportSettings").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ app: "social-photo-exporter", version: 1, settings: readDraft() }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = "social-photo-exporter-settings.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });
  const fileInput = dialog.querySelector("#settingsFile");
  dialog.querySelector("#importSettings").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0]; fileInput.value = "";
    if (!file) return;
    try {
      if (file.size > 64000) throw new Error(text.invalid);
      const value = JSON.parse(await file.text());
      if (value.app !== "social-photo-exporter" || value.version !== 1) throw new Error(text.invalid);
      const settings = validate(value.settings);
      apply(settings); save(); fill(); status.textContent = text.imported; setStatus(text.imported);
    } catch {
      status.textContent = text.invalid;
      status.scrollIntoView({ block: "nearest" });
    }
  });
  function scheduleSave(event) {
    if (dialog.contains(event.target) || event.target.closest("[data-open-photo-order]")) return;
    clearTimeout(timer); timer = setTimeout(save, 200);
  }
  for (const type of ["input", "change", "click", "pointerup"]) document.addEventListener(type, scheduleSave);
  window.addEventListener("pagehide", save);
  save();
})();
