(() => {
  const pt = document.documentElement.lang === "pt-PT";
  const t = pt ? {
    title: "Biblioteca local", projects: "Projetos", brands: "Conjuntos de Marca", close: "Fechar biblioteca",
    name: "Nome", save: "Guardar projeto", saveBrand: "Guardar marca atual", open: "Abrir", apply: "Aplicar",
    backup: "Transferir cópia", restore: "Importar cópia", remove: "Eliminar", empty: "Ainda não há itens guardados.",
    saved: "Guardado neste navegador.", loading: "A preparar...", error: "Não foi possível concluir. Verifique o espaço disponível e os ficheiros.",
    replace: "Abrir este projeto e substituir o trabalho atual?", delete: "Eliminar esta cópia local? Uma cópia transferida não será eliminada.",
    logo: "Logótipo", frame: "Moldura", defaultFrames: "Repor molduras APCM", invalidFrame: "Use um PNG transparente com a proporção indicada.",
    local: "Neste navegador", count: "fotografias", done: "Projeto aberto.", applied: "Conjunto de Marca aplicado.",
    required: "Introduza um nome.", unavailable: "O armazenamento local não está disponível. Pode transferir uma cópia do projeto.",
  } : {
    title: "Local library", projects: "Projects", brands: "Brand Sets", close: "Close library",
    name: "Name", save: "Save project", saveBrand: "Save current brand", open: "Open", apply: "Apply",
    backup: "Download backup", restore: "Import backup", remove: "Delete", empty: "No saved items yet.",
    saved: "Saved in this browser.", loading: "Preparing...", error: "Could not finish. Check available storage and files.",
    replace: "Open this project and replace your current work?", delete: "Delete this local copy? Downloaded backups will not be deleted.",
    logo: "Logo", frame: "Frame", defaultFrames: "Restore APCM frames", invalidFrame: "Use a transparent PNG with the indicated ratio.",
    local: "In this browser", count: "photos", done: "Project opened.", applied: "Brand Set applied.",
    required: "Enter a name.", unavailable: "Local storage is unavailable. You can still download a project backup.",
  };
  const ratios = { "apcm-4x5": [4, 5], "apcm-story": [9, 16], "apcm-16x9": [16, 9] };
  const brandKeys = ["frameEnabled", "logoPosition", "logoSize", "logoOpacity", "logoRotation"];
  const limit = 1024 * 1024 * 1024;
  let database;
  let busy = false;
  let tab = "projects";
  const dialog = document.createElement("dialog");
  dialog.id = "libraryDialog";
  dialog.className = "settings-dialog library-dialog";
  dialog.setAttribute("aria-labelledby", "libraryTitle");
  dialog.innerHTML = `<header class="settings-header"><h2 id="libraryTitle">${t.title}</h2><button type="button" class="icon-button" data-close title="${t.close}" aria-label="${t.close}"><svg><use href="#icon-x"></use></svg></button></header>
    <div class="library-tabs" role="tablist"><button type="button" role="tab" data-tab="projects">${t.projects}</button><button type="button" role="tab" data-tab="brands">${t.brands}</button></div>
    <div class="settings-content"><form id="librarySave"><label class="settings-field">${t.name}<input id="libraryName" maxlength="100" required></label><button class="primary-button" id="librarySaveButton">${t.save}</button></form>
    <div id="libraryBrandControls" hidden></div><div id="libraryItems"></div><div class="mini-status" id="libraryStatus" role="status"></div></div>
    <footer class="settings-footer"><span class="library-location">${t.local}</span><button class="secondary-button" type="button" id="libraryBackup">${t.backup}</button><button class="secondary-button" type="button" id="libraryRestore">${t.restore}</button><input id="libraryBackupFile" type="file" accept=".spe" hidden></footer>`;
  document.body.append(dialog);
  const button = document.createElement("button");
  button.type = "button"; button.id = "openLibrary"; button.className = "icon-button";
  button.title = t.title; button.setAttribute("aria-label", t.title);
  button.innerHTML = '<svg><use href="#icon-image"></use></svg>';
  document.querySelector(".topbar-actions").prepend(button);
  const status = dialog.querySelector("#libraryStatus");
  const nameInput = dialog.querySelector("#libraryName");
  const brandControls = dialog.querySelector("#libraryBrandControls");

  function db() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open("social-photo-exporter-library", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("items", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error(t.unavailable));
    });
    return database;
  }
  async function transact(mode, operation) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("items", mode);
      const request = operation(transaction.objectStore("items"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = transaction.onabort = () => reject(transaction.error || request.error);
    });
  }
  async function run(operation) {
    if (busy) return;
    busy = true; status.textContent = t.loading;
    dialog.querySelectorAll("button,input").forEach(control => control.disabled = true);
    try { await operation(); }
    catch (error) { status.textContent = error.message === t.invalidFrame ? t.invalidFrame : t.error; }
    finally {
      busy = false; dialog.querySelectorAll("button,input").forEach(control => control.disabled = false);
    }
  }
  function imageBlob(image) {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      canvas.getContext("2d").drawImage(image, 0, 0);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Image unavailable")), "image/png");
    });
  }
  async function capture(kind, name) {
    const settings = window.exporterSettings.capture();
    const frames = {};
    for (const [id, image] of Object.entries(state.frames)) frames[id] = await imageBlob(image);
    const logo = state.logo ? { name: state.logo.name, file: state.logo.file || await imageBlob(state.logo.image) } : null;
    const record = { version: 1, id: crypto.randomUUID(), kind, name, date: new Date().toISOString(), frames, logo,
      settings: kind === "brands" ? Object.fromEntries(brandKeys.map(key => [key, settings[key]])) : settings };
    if (kind === "projects") {
      record.photos = state.photos.map(photo => ({ file: photo.file, name: photo.name, zoom: photo.zoom,
        offset: { ...photo.offset }, blurBackground: photo.blurBackground, faces: photo.faces, faceStatus: photo.faceStatus }));
      record.activeIndex = Math.max(0, state.photos.findIndex(photo => photo.id === state.activePhotoId));
      record.music = state.music ? { file: state.music.file, name: state.music.name, start: state.musicStart } : null;
    }
    return record;
  }
  async function prepareImage(blob) {
    if (!(blob instanceof Blob)) throw new Error("Invalid image");
    const url = URL.createObjectURL(blob);
    const image = new Image();
    try { await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; }); }
    catch (error) { URL.revokeObjectURL(url); throw error; }
    return { image, url };
  }
  async function applyRecord(record) {
    if (record?.version !== 1 || !["projects", "brands"].includes(record.kind)) throw new Error("Invalid project");
    const settings = window.exporterSettings.validate({ ...window.exporterSettings.capture(), ...record.settings });
    const prepared = []; const frames = {}; const photos = [];
    let logo; let music; let committed = false;
    try {
      for (const [id, blob] of Object.entries(record.frames || {})) {
        if (!(id in ratios)) throw new Error("Invalid frame");
        const asset = await prepareImage(blob); prepared.push(asset); frames[id] = asset.image;
      }
      if (record.logo) {
        const asset = await prepareImage(record.logo.file); prepared.push(asset);
        logo = { ...asset, file: record.logo.file, name: record.logo.name };
      }
      if (record.kind === "projects") {
        if (!Array.isArray(record.photos) || record.photos.length > MAX_PHOTOS) throw new Error("Invalid batch");
        for (const item of record.photos) {
          if (!(item.file instanceof Blob) || !Number.isFinite(item.zoom) || item.zoom < 0.5 || item.zoom > 3 ||
            !Number.isFinite(item.offset?.x) || !Number.isFinite(item.offset?.y) || Math.abs(item.offset.x) > 0.6 || Math.abs(item.offset.y) > 0.6 ||
            (item.faces !== null && (!Array.isArray(item.faces) || item.faces.length > 100 || item.faces.some(face =>
              !face || ["x", "y", "width", "height"].some(key => !Number.isFinite(face[key])))))) throw new Error("Invalid photo");
          const file = new File([item.file], String(item.name), { type: item.file.type });
          const photo = await loadImageFile(file, photos.length);
          photos.push(photo);
          Object.assign(photo, { zoom: item.zoom, offset: item.offset, blurBackground: Boolean(item.blurBackground),
            faces: item.faces, faceStatus: ["detected", "none", "unsupported", "error"].includes(item.faceStatus) ? item.faceStatus : "waiting" });
          releasePhotoImage(photo, true);
        }
        if (record.music) {
          const context = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: AUDIO_SAMPLE_RATE });
          try {
            const buffer = await context.decodeAudioData(await record.music.file.arrayBuffer());
            music = { buffer, file: record.music.file, name: record.music.name, url: URL.createObjectURL(record.music.file) };
          } finally { await context.close(); }
        }
      }
      const selectedPhoto = photos[Math.min(Math.max(0, Number(record.activeIndex) || 0), photos.length - 1)];
      if (selectedPhoto) await ensurePhotoImage(selectedPhoto);
      window.exporterSettings.apply(settings);
      if (state.logo?.url) URL.revokeObjectURL(state.logo.url);
      for (const image of Object.values(state.frames)) if (image.src.startsWith("blob:")) URL.revokeObjectURL(image.src);
      state.logo = logo || null; state.frames = frames; state.frameStatus = "ready";
      els.logoName.textContent = logo ? shortName(logo.name) : t.logo;
      setFrameStatus(`${Object.keys(frames).length} ${t.frame}`);
      if (record.kind === "projects") {
        clearPhotos(); clearMusic(); state.photos = photos;
        state.activePhotoId = selectedPhoto?.id || null;
        if (music) {
          state.music = music; state.musicStart = clamp(Number(record.music.start) || 0, 0, music.buffer.duration);
          els.musicPlayer.src = music.url; els.musicPlayer.hidden = false;
          state.musicMessage = `${music.name} / ${Math.round(music.buffer.duration)} s`;
        }
      }
      committed = true; syncControls(); renderPreview(); renderPhotoList(); renderOrderPreview();
      status.textContent = record.kind === "projects" ? t.done : t.applied;
    } finally {
      if (!committed) {
        prepared.forEach(asset => URL.revokeObjectURL(asset.url));
        photos.forEach(photo => { releasePhotoImage(photo, true); URL.revokeObjectURL(photo.url); });
        if (music) URL.revokeObjectURL(music.url);
      }
    }
  }
  async function refresh() {
    const list = dialog.querySelector("#libraryItems"); list.replaceChildren();
    let records;
    try { records = await transact("readonly", store => store.getAll()); }
    catch { status.textContent = t.unavailable; return; }
    for (const record of records.filter(item => item.kind === tab).sort((a, b) => b.date.localeCompare(a.date))) {
      const row = document.createElement("div"); row.className = "library-item";
      const description = document.createElement("div");
      const title = document.createElement("strong"); title.textContent = record.name;
      const detail = document.createElement("small"); detail.textContent = `${new Date(record.date).toLocaleDateString()}${record.photos ? ` / ${record.photos.length} ${t.count}` : ""}`;
      description.append(title, detail); row.append(description);
      for (const [label, action] of [[tab === "projects" ? t.open : t.apply, async () => {
        if (tab === "projects" && state.photos.length && !confirm(t.replace)) return;
        await applyRecord(record);
      }], [t.backup, () => downloadRecord(record)], [t.remove, async () => {
        if (!confirm(t.delete)) return;
        await transact("readwrite", store => store.delete(record.id)); await refresh(); status.textContent = t.saved;
      }]]) {
        const control = document.createElement("button"); control.type = "button"; control.className = "secondary-button";
        control.textContent = label; control.onclick = () => run(action); row.append(control);
      }
      list.append(row);
    }
    if (!list.children.length) { const empty = document.createElement("p"); empty.textContent = t.empty; list.append(empty); }
  }
  async function pack(record) {
    const blobs = []; let offset = 0;
    function encode(value) {
      if (value instanceof Blob) {
        const result = { asset: true, offset, size: value.size, type: value.type };
        offset += value.size; blobs.push(value); return result;
      }
      if (Array.isArray(value)) return value.map(encode);
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
      return value;
    }
    const metadata = new TextEncoder().encode(JSON.stringify(encode(record)));
    if (offset > limit || metadata.length > 1024 * 1024) throw new Error("Project too large");
    const header = new Uint8Array(8); header.set([83, 80, 69, 49]); new DataView(header.buffer).setUint32(4, metadata.length, true);
    return new Blob([header, metadata, ...blobs], { type: "application/octet-stream" });
  }
  async function unpack(file) {
    if (file.size > limit + 1024 * 1024 || file.size < 8) throw new Error("Invalid backup");
    const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    if (header.slice(0, 4).join() !== "83,80,69,49") throw new Error("Invalid backup");
    const length = new DataView(header.buffer).getUint32(4, true);
    if (length > 1024 * 1024 || length + 8 > file.size) throw new Error("Invalid backup");
    const data = JSON.parse(await file.slice(8, 8 + length).text());
    function decode(value) {
      if (value?.asset === true) {
        if (!Number.isSafeInteger(value.offset) || value.offset < 0 || !Number.isSafeInteger(value.size) || value.size < 0 ||
          value.offset + value.size + 8 + length > file.size || typeof value.type !== "string") throw new Error("Invalid asset");
        return file.slice(8 + length + value.offset, 8 + length + value.offset + value.size, value.type);
      }
      if (Array.isArray(value)) return value.map(decode);
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]));
      return value;
    }
    return decode(data);
  }
  async function downloadRecord(record) {
    const blob = await pack(record); const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `${record.name.replace(/[^a-z0-9_-]/gi, "-") || "project"}.spe`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); status.textContent = t.backup;
  }
  for (const [id, ratio] of Object.entries(ratios)) {
    const label = document.createElement("label"); label.className = "settings-field";
    label.textContent = `${t.frame} ${ratio.join(":")}`;
    const input = document.createElement("input"); input.type = "file"; input.accept = "image/png"; input.dataset.frame = id;
    input.onchange = () => run(async () => {
      const file = input.files[0]; input.value = ""; if (!file) return;
      const asset = await prepareImage(file);
      const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 64;
      const context = canvas.getContext("2d"); context.drawImage(asset.image, 0, 0, 64, 64);
      const pixels = context.getImageData(0, 0, 64, 64).data;
      if (file.type !== "image/png" || Math.abs(asset.image.naturalWidth / asset.image.naturalHeight - ratio[0] / ratio[1]) > 0.01 ||
        !pixels.some((value, index) => index % 4 === 3 && value < 255)) {
        URL.revokeObjectURL(asset.url); throw new Error(t.invalidFrame);
      }
      if (state.frames[id]?.src.startsWith("blob:")) URL.revokeObjectURL(state.frames[id].src);
      state.frames[id] = asset.image; state.frameStatus = "ready"; state.frameEnabled = true;
      clearReadyDownload(); syncControls(); renderPreview(); status.textContent = `${t.frame} ${ratio.join(":")}`;
    }); label.append(input); brandControls.append(label);
  }
  const reset = document.createElement("button"); reset.type = "button"; reset.className = "secondary-button"; reset.textContent = t.defaultFrames;
  reset.onclick = () => run(async () => {
    Object.values(state.frames).forEach(image => { if (image.src.startsWith("blob:")) URL.revokeObjectURL(image.src); });
    await loadFrameAssets(); clearReadyDownload(); status.textContent = t.defaultFrames;
  }); brandControls.append(reset);
  button.onclick = async () => {
    if (state.exporting || state.loadingPhotos || state.scanInProgress || state.musicLoading || state.frameStatus === "loading") return;
    dialog.showModal(); await refresh();
  };
  dialog.querySelector("[data-close]").onclick = () => dialog.close();
  dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  dialog.querySelectorAll("[data-tab]").forEach(control => control.onclick = async () => {
    tab = control.dataset.tab; brandControls.hidden = tab !== "brands";
    dialog.querySelector("#librarySaveButton").textContent = tab === "brands" ? t.saveBrand : t.save;
    dialog.querySelectorAll("[data-tab]").forEach(item => item.setAttribute("aria-selected", String(item === control)));
    await refresh();
  });
  dialog.querySelector('[data-tab="projects"]').setAttribute("aria-selected", "true");
  dialog.querySelector('[data-tab="brands"]').setAttribute("aria-selected", "false");
  dialog.querySelector("#librarySave").onsubmit = event => {
    event.preventDefault(); run(async () => {
      const name = nameInput.value.trim(); if (!name) { status.textContent = t.required; return; }
      const record = await capture(tab, name);
      // Verify the backup size before asking IndexedDB to store a large batch.
      await pack(record);
      await transact("readwrite", store => store.put(record)); await refresh(); status.textContent = t.saved;
    });
  };
  dialog.querySelector("#libraryBackup").onclick = () => run(async () => downloadRecord(await capture(tab, nameInput.value.trim() || "project")));
  const backupFile = dialog.querySelector("#libraryBackupFile");
  dialog.querySelector("#libraryRestore").onclick = () => backupFile.click();
  backupFile.onchange = () => run(async () => {
    const file = backupFile.files[0]; backupFile.value = ""; if (!file) return;
    const record = await unpack(file);
    if (record.kind === "projects" && state.photos.length && !confirm(t.replace)) { status.textContent = ""; return; }
    await applyRecord(record);
  });
})();
