/**
 * @class NotesManager
 * @description Gestisce l'intero ciclo di vita delle note: creazione, modifica, eliminazione,
 * rendering delle diverse viste (Griglia, Tabella, Kanban), drag & drop, filtri, ricerca e sicurezza (PIN).
 */
class NotesManager {
    /**
     * Inizializza il gestore delle note con lo stato di default.
     * @param {Object} app - L'istanza principale dell'applicazione.
     */
    constructor(app) {
        this.app = app;
        this.currentNoteId = null;
        this.draggedNoteId = null;
        this.tempCreationImages = [];
        this.tempModalImages = [];
        this.currentImgIndex = 0;
        this.isEditing = false;
        this.autoSaveTimer = null;
        this.hasPendingSave = false;
        this.swappedNotes = [];
        this.isZenMode = false;
        this.activeSourceId = null;
        this.activeZenTextarea = null; // Ricorda quale textarea stiamo ingrandendo
        this.targetTextarea = null;

    }

    /**
     * Collega tutti gli ascoltatori di eventi del DOM per i bottoni, i campi di ricerca,
     * i menu a tendina, il caricamento delle immagini e l'interfaccia Drag & Drop.
     */
    initEvents() {
        document.getElementById("addNoteBtn")?.addEventListener("click", () => this.addNote());

        // Switcher Vista
        document.getElementById("viewGridBtn")?.addEventListener("click", () => { this.app.settings.viewMode = 'grid'; this.app.settingsMgr.apply(); this.renderNotes(); });
        document.getElementById("viewTableBtn")?.addEventListener("click", () => { this.app.settings.viewMode = 'table'; this.app.settingsMgr.apply(); this.renderNotes(); });

        // Filtri e Ricerca
        document.getElementById("searchInput")?.addEventListener("input", () => this.renderNotes());
        document.getElementById("sortSelect")?.addEventListener("change", () => this.renderNotes());
        document.getElementById("smartFilterSelect")?.addEventListener("change", () => this.renderNotes());
        document.getElementById("emptyTrashBtn")?.addEventListener("click", () => this.emptyTrash());

        document.getElementById("markdownHelpBtn")?.addEventListener("click", () => document.getElementById("markdownHelpModal").classList.remove("hidden"));
        document.getElementById("closeMarkdownBtn")?.addEventListener("click", () => document.getElementById("markdownHelpModal").classList.add("hidden"));

        document.getElementById("noteTemplate")?.addEventListener("change", (e) => {
            const t = e.target.value; const desc = document.getElementById("noteDesc");
            if (t === "riunione") desc.value = "**Data:** \n**Partecipanti:** \n\n**Ordine del giorno:**\n- \n- \n\n**Azioni:**\n[ ] ";
            else if (t === "spesa") desc.value = "**Da Comprare:**\n[ ] Acqua\n[ ] Pane\n[ ] \n[ ] ";
            else desc.value = "";
            desc.dispatchEvent(new Event('input'));
        });

        document.getElementById("noteDesc")?.addEventListener("input", (e) => {
            const val = e.target.value; const p = document.getElementById("noteDescPreview");
            if (val.trim() === "") { p.classList.add("hidden"); } else { p.classList.remove("hidden"); p.innerHTML = Utils.parseMarkdown(val); }
        });

        const creationInputs = ["noteTitle", "noteDesc", "noteDate", "noteTime", "noteWorkspace", "notePriority", "noteTags", "noteColor", "notePin"];
        creationInputs.forEach(id => {
            document.getElementById(id)?.addEventListener("input", () => this.saveDraft());
            document.getElementById(id)?.addEventListener("change", () => this.saveDraft());
        });

        const editInputs = ["modalTitle", "modalDesc", "modalDateOnly", "modalTimeOnly", "modalPriority", "modalWorkspace", "modalTagsInput", "modalColor", "modalPin"];
        editInputs.forEach(id => {
            document.getElementById(id)?.addEventListener("input", () => this.triggerAutoSave());
            document.getElementById(id)?.addEventListener("change", () => this.triggerAutoSave());
        });

        document.getElementById("noteDesc")?.addEventListener("keydown", (e) => this.handleFastDelete(e));
        document.getElementById("modalDesc")?.addEventListener("keydown", (e) => this.handleFastDelete(e));

        document.getElementById("noteImage")?.addEventListener("change", async (e) => {
            const files = e.target.files; if (!files || files.length === 0) return;
            for (let i = 0; i < files.length; i++) this.tempCreationImages.push(await Utils.getImageBase64(files[i]));
            this.renderCreationImages(); this.saveDraft(); e.target.value = '';
        });

        document.getElementById("closeModalBtn")?.addEventListener("click", () => this.closeModal());
        document.getElementById("modalEditBtn")?.addEventListener("click", () => this.enableEdit());
        document.getElementById("modalSaveBtn")?.addEventListener("click", () => this.saveModified(false));
        document.getElementById("modalDoneBtn")?.addEventListener("click", () => this.disableEdit());
        document.getElementById("modalTimeMachineBtn")?.addEventListener("click", () => this.restoreVersion());
        document.getElementById("modalDeleteBtn")?.addEventListener("click", () => { this.moveToTrash(this.currentNoteId); this.closeModal(); });

        document.getElementById("prevImgBtn")?.addEventListener("click", () => this.changeModalImage(-1));
        document.getElementById("nextImgBtn")?.addEventListener("click", () => this.changeModalImage(1));
        document.getElementById("modalSetCoverBtn")?.addEventListener("click", () => {
            if (this.tempModalImages.length <= 1 || this.currentImgIndex === 0) return;
            const img = this.tempModalImages.splice(this.currentImgIndex, 1)[0];
            this.tempModalImages.unshift(img); this.currentImgIndex = 0;
            this.renderModalImages(); this.triggerAutoSave(); Utils.showToast("Copertina impostata!");
        });
        document.getElementById("modalDelImgBtn")?.addEventListener("click", () => {
            if (this.tempModalImages.length === 0) return;
            this.tempModalImages.splice(this.currentImgIndex, 1);
            if (this.currentImgIndex >= this.tempModalImages.length) this.currentImgIndex = Math.max(0, this.tempModalImages.length - 1);
            this.renderModalImages(); this.triggerAutoSave();
        });
        document.getElementById("modalAddImgInput")?.addEventListener("change", async (e) => {
            const files = e.target.files; if (!files || files.length === 0) return;
            for (let i = 0; i < files.length; i++) this.tempModalImages.push(await Utils.getImageBase64(files[i]));
            this.currentImgIndex = this.tempModalImages.length - 1;
            this.renderModalImages(); this.triggerAutoSave(); e.target.value = '';
        });

        document.getElementById("cancelPinPromptBtn")?.addEventListener("click", () => { document.getElementById("pinPromptModal").classList.add("hidden"); document.getElementById("checkPinInput").value = ""; });
        document.getElementById("confirmPinPromptBtn")?.addEventListener("click", () => this.verifyPin());

        const setupDropZone = (dz, actionFn) => {
            if (!dz) return;
            dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag-over'); });
            dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
            dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag-over'); if (this.draggedNoteId) actionFn(this.draggedNoteId, dz); });
        };

        setupDropZone(document.getElementById("dropZoneTrash"), (id, dz) => this.animateAndExecute(id, dz, () => this.moveToTrash(id)));
        setupDropZone(document.getElementById("dropZoneRestore"), (id, dz) => this.animateAndExecute(id, dz, () => this.restore(id)));
        setupDropZone(document.getElementById("dropZoneGeneral"), (id, dz) => this.animateAndExecute(id, dz, () => this.moveNoteToWorkspace(id, "")));

        setTimeout(() => this.loadDraft(), 500);
        document.getElementById("zenCreateBtn")?.addEventListener("click", () => {
        console.log("Stella Dashboard cliccata!"); // Questo serve a te per testare
        this.enterZenMode("noteDesc");
    });
        document.getElementById("zenModalBtn")?.addEventListener("click", () => this.enterZenMode("modalDesc"));
        document.getElementById("exitZenBtn")?.addEventListener("click", () => this.exitZenMode());

        const editors = ["noteDescription", "modalDescription", "zen-editor-area"];
        editors.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;

            // Rileva la scrittura
            el.addEventListener("input", () => this.handleAutocomplete(el));

            // Gestisce la navigazione da tastiera (Frecce e Invio)
            el.addEventListener("keydown", (e) => {
                if (!this.autocompleteActive) return;

                if (e.key === "ArrowDown") {
                    e.preventDefault();
                    this.autocompleteIndex = (this.autocompleteIndex + 1) % this.filteredNotes.length;
                    this.updateAutocompleteSelection();
                } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    this.autocompleteIndex = (this.autocompleteIndex - 1 + this.filteredNotes.length) % this.filteredNotes.length;
                    this.updateAutocompleteSelection();
                } else if (e.key === "Enter") {
                    e.preventDefault();
                    this.insertLink(this.filteredNotes[this.autocompleteIndex].title);
                } else if (e.key === "Escape") {
                    this.closeAutocomplete();
                }
            });
        });
        // 🟢 FIX ESC: Evento catturato a livello di window per essere sicuri
        window.addEventListener("keydown", (e) => {
     //Se premuto ESC e la modalità Zen è attiva (overlay visibile)
    if (e.key === "Escape" && this.isZenMode) {
        e.preventDefault();
        this.exitZenMode();
    }
});
    }

    /**
     * Cuore del motore di rendering. Calcola i filtri attivi, gestisce l'ordinamento
     * e inietta le note nel DOM in base alla visualizzazione selezionata (Griglia, Tabella, Kanban).
     */
    renderNotes() {

        const listTrash = document.getElementById("trashList");

        // 1. Pulizia Totale
        const listAll = document.getElementById("notesList");
        const listPinned = document.getElementById("pinnedNotesList");
        const folderExplorer = document.getElementById("subfolders-explorer"); // Il nuovo contenitore

        if (!listAll) return;

        const viewMode = this.app.settings.viewMode || 'grid';
        const isTable = viewMode === 'table';
        const isKanban = viewMode === 'kanban';

        // 1. Pulizia corretta
        listAll.innerHTML = "";
        if (listTrash) listTrash.innerHTML = "";
        if (listPinned) listPinned.innerHTML = "";
        if (folderExplorer) folderExplorer.innerHTML = ""; // Puliamo il contenitore cartelle

        // FIX: Rimuove la classe griglia se non siamo in modalità card
        if (isTable || isKanban) {
            listAll.classList.remove("notes-grid");
            if (listPinned) listPinned.classList.remove("notes-grid");
        } else {
            listAll.classList.add("notes-grid");
            if (listPinned) listPinned.classList.add("notes-grid");
        }
        
        // 🟢 RICERCA SMART: Supporto per Sinonimi (Alias)
        
        // --- 2. PANNELLO DI CONTROLLO CARTELLA & SOTTOCARTELLE ---
        const currentFolderId = this.app.fileSystem.currentFolderId;
        const subFolders = (this.app.loggedUser.folders || []).filter(f => f.parentId === (currentFolderId === "root" ? null : currentFolderId));

        

        if (folderExplorer) {
            folderExplorer.innerHTML = ""; // Pulizia

            // A. Crea la Barra delle Azioni (Action Bar)
            const actionBar = document.createElement("div");
            actionBar.style.cssText = "display: flex; flex-wrap: wrap; gap: 15px; justify-content: space-between; align-items: center; background: var(--bg-card2); padding: 15px 20px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 20px;";

            if (currentFolderId !== "root") {
                const currentFolder = this.app.loggedUser.folders.find(f => f.id === currentFolderId);
                if (currentFolder) {
                    // SE SIAMO DENTRO UNA CARTELLA: Mostra nome, aggiungi, rinomina, elimina
                    actionBar.innerHTML = `
                        <div style="font-weight: bold; font-size: 16px; color: var(--text-1); display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 20px;">📂</span> ${currentFolder.name}
                        </div>
                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                            <button class="btn" onclick="app.fileSystem.addFolderPrompt('${currentFolder.id}')" style="padding: 8px 15px; font-size: 13px;">➕ Nuova Sottocartella</button>
                            <button class="btn" onclick="app.fileSystem.renameFolderPrompt('${currentFolder.id}')" style="padding: 8px 15px; font-size: 13px; background: var(--badge-warn-t); color: #000;">✏️ Rinomina</button>
                            <button class="btn btn-danger" onclick="app.fileSystem.deleteFolder('${currentFolder.id}')" style="padding: 8px 15px; font-size: 13px;">🗑️ Elimina</button>
                        </div>
                    `;
                }
            } else {
                // SE SIAMO NELLA HOME (ROOT): Mostra solo Aggiungi Cartella Principale
                actionBar.innerHTML = `
                    <div style="font-weight: bold; font-size: 16px; color: var(--text-1); display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 20px;">🏠</span> Tutte le Note
                    </div>
                    <button class="btn" onclick="app.fileSystem.addFolderPrompt(null)" style="padding: 8px 15px; font-size: 13px;">➕ Nuova Cartella</button>
                `;
            }
            folderExplorer.appendChild(actionBar);
            folderExplorer.classList.remove("hidden");

            // B. Crea la Griglia delle Sottocartelle visibili (se ce ne sono)
            if (subFolders.length > 0) {
                const folderSection = document.createElement("div");
                folderSection.innerHTML = `<h3 class="section-title" style="margin-top: 10px;">📁 Sottocartelle (${subFolders.length})</h3>`;
                const folderGrid = document.createElement("div");
                folderGrid.className = "folder-card-container";

                subFolders.forEach(f => {
                    const fCard = document.createElement("div");
                    fCard.className = "folder-card";
                    fCard.innerHTML = `<span class="icon">📁</span> <span class="name">${f.name}</span>`;
                    fCard.onclick = () => this.app.fileSystem.showFolder(f.id);

                    // Drag & drop intatto
                    fCard.ondragover = (e) => { e.preventDefault(); fCard.style.borderColor = "var(--accent)"; };
                    fCard.ondragleave = () => fCard.style.borderColor = "";
                    fCard.ondrop = (e) => {
                        e.preventDefault(); fCard.style.borderColor = "";
                        if (this.draggedNoteId) this.moveNoteToWorkspace(this.draggedNoteId, f.id);
                    };
                    folderGrid.appendChild(fCard);
                });

                folderSection.appendChild(folderGrid);
                folderExplorer.appendChild(folderSection);
            }
        }

        // --- 4. PREPARAZIONE NOTE E FILTRI ---
        const filterText = (document.getElementById("searchInput")?.value || "").toLowerCase();
        const sortVal = document.getElementById("sortSelect")?.value || "newest";

        const smartFilterSelect = document.getElementById("smartFilterSelect");
        const smartFilter = smartFilterSelect?.value || "all";

        // FIX KANBAN: Disabilita il filtro priorità se siamo in Kanban
        if (isKanban && smartFilterSelect) {
            smartFilterSelect.disabled = true;
            smartFilterSelect.title = "Filtro disabilitato in vista Kanban";
            smartFilterSelect.style.opacity = "0.5";
        } else if (smartFilterSelect) {
            smartFilterSelect.disabled = false;
            smartFilterSelect.title = "";
            smartFilterSelect.style.opacity = "1";
        }

        let activeNotes = this.app.loggedUser.notes.filter(n => n.status !== 'trashed');
        let trashedNotes = this.app.loggedUser.notes.filter(n => n.status === 'trashed');

        // Filtro per Cartella
        if (currentFolderId !== "root") {
            activeNotes = activeNotes.filter(n => n.folderId === currentFolderId);
        }

        // Filtro Smart (Priorità e Scadenza)
        if (smartFilter !== "all") {
            if (smartFilter === "urgent") {
                const now = new Date(); const tom = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                activeNotes = activeNotes.filter(n => n.dueDate && new Date(n.dueDate) > now && new Date(n.dueDate) <= tom);
            } else if (!isKanban) {
                // I filtri priorità agiscono SOLO se non siamo in Kanban
                if (smartFilter === "high_prio") activeNotes = activeNotes.filter(n => n.priority === "alta");
                if (smartFilter === "mid_prio") activeNotes = activeNotes.filter(n => n.priority === "media");
                if (smartFilter === "low_prio") activeNotes = activeNotes.filter(n => n.priority === "bassa");
            }
        }

        // Filtro di Ricerca Testuale
        // 🟢 RICERCA SMART (FIX): Supporto parziale per Sinonimi (Alias) durante la digitazione
        // 🟢 RICERCA SMART: Supporto per Sinonimi e Gerarchie (Parent -> Children)
        if (filterText) {
            let searchKeys = [filterText];
            
            if (this.app.tagManager) {
                for (const [mainTag, data] of Object.entries(this.app.tagManager.tags)) {
                    const lowMain = mainTag.toLowerCase();
                    // 1. Controlla se il testo cercato è il tag o un suo alias
                    const isAlias = data.aliases && data.aliases.some(a => a.includes(filterText));
                    
                    if (lowMain.includes(filterText) || isAlias) {
                        // 2. Recupera tutta la "famiglia" (tag + tutti i discendenti)
                        const family = this.app.tagManager.getFamily(mainTag);
                        searchKeys = [...new Set([...searchKeys, ...family])];
                    }
                }
            }

            activeNotes = activeNotes.filter(n =>
                n.title.toLowerCase().includes(filterText) ||
                (n.description && n.description.toLowerCase().includes(filterText)) ||
                (n.tags && n.tags.some(tag => searchKeys.includes(tag.toLowerCase())))
            );
        }

        // 4. ORDINAMENTO
        activeNotes.sort((a, b) => {
            if (sortVal === "expiring") {
                if (!a.dueDate) return 1;
                if (!b.dueDate) return -1;
                return new Date(a.dueDate) - new Date(b.dueDate);
            }
            const idxA = this.app.loggedUser.notes.findIndex(n => n.id === a.id);
            const idxB = this.app.loggedUser.notes.findIndex(n => n.id === b.id);
            if (sortVal === "oldest") return idxB - idxA;
            return idxA - idxB;
        });

        // 5. RENDER CESTINO
        if (listTrash) {
            trashedNotes.forEach(note => listTrash.appendChild(this.createCard(note, true)));
        }

        const pinnedTitle = document.querySelector(".pinned-title");

        // 6. VISTA KANBAN
        if (isKanban) {
            if (pinnedTitle) pinnedTitle.classList.add("hidden");

            const createKanbanColumn = (title, priority, cssClass) => {
                let colNotes = activeNotes.filter(n => n.priority === priority);

                colNotes.sort((a, b) => {
                    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
                    return 0;
                });

                const colWrapper = document.createElement("div");
                colWrapper.className = "kanban-column";
                colWrapper.innerHTML = `
                    <div class="kanban-header ${cssClass}">
                        <span>${title}</span>
                        <span style="font-size: 11px; background: var(--bg-hover); padding: 3px 8px; border-radius: 12px; color: var(--text-1);">${colNotes.length}</span>
                    </div>
                    <div class="kanban-dropzone" 
                         ondragover="app.notes.handleKanbanDragOver(event)"
                         ondragleave="app.notes.handleKanbanDragLeave(event)"
                         ondrop="app.notes.handleKanbanDrop(event, '${priority}')">
                    </div>
                `;

                const dropzone = colWrapper.querySelector(".kanban-dropzone");

                if (colNotes.length === 0) {
                    dropzone.innerHTML = `
                        <div style="text-align:center; padding: 30px 10px; color: var(--text-3); font-size: 12px; border: 1px dashed var(--border); border-radius: 12px; margin-top: 10px;">
                            📭 Nessun appunto in questa priorità
                        </div>`;
                } else {
                    const pinnedInCol = colNotes.filter(n => n.isPinned);
                    const othersInCol = colNotes.filter(n => !n.isPinned);

                    if (pinnedInCol.length > 0) {
                        pinnedInCol.forEach(n => dropzone.appendChild(this.createCard(n)));
                        if (othersInCol.length > 0) {
                            const sep = document.createElement("div");
                            sep.style.cssText = "height: 1px; background: var(--border); margin: 10px 0; position: relative;";
                            sep.innerHTML = '<span style="position:absolute; top:-8px; left:50%; transform:translateX(-50%); background:var(--bg-card2); padding:0 10px; font-size:10px; color:var(--text-3); text-transform:uppercase;">Altre Note</span>';
                            dropzone.appendChild(sep);
                        }
                    }
                    othersInCol.forEach(n => dropzone.appendChild(this.createCard(n)));
                }
                return colWrapper;
            };

            const kanbanContainer = document.createElement("div");
            kanbanContainer.className = "kanban-board";
            kanbanContainer.appendChild(createKanbanColumn('🔥 Priorità Alta', 'alta', 'prio-alta'));
            kanbanContainer.appendChild(createKanbanColumn('⚡ Priorità Media', 'media', 'prio-media'));
            kanbanContainer.appendChild(createKanbanColumn('☕ Priorità Bassa', 'bassa', 'prio-bassa'));

            listAll.appendChild(kanbanContainer);
        }

        // 7. VISTA TABELLA
       else if (isTable) {
            // 🟢 Recupera il termine di ricerca
            const searchTerm = document.getElementById("searchInput")?.value.trim();

            const createTable = (data) => {
                const container = document.createElement("div"); 
                container.className = "notes-table-container";
                container.innerHTML = `<table class="notes-table"><thead><tr><th style="width:50px;text-align:center;">Pin</th><th>Titolo</th><th>Workspace</th><th>Priorità</th></tr></thead><tbody>${data.map(n => {
                    const bgColorStyle = (n.color && !n.pin) ? `background-color: ${n.color}; border-color: ${n.color};` : '';
                    
                    // 🟢 Evidenzia il titolo della riga
                    let displayTitle = n.title;
                    if (searchTerm && !n.pin) {
                        displayTitle = Utils.highlightText(displayTitle, searchTerm);
                    }
                    // 🟢 FIX: Ora usiamo ${displayTitle} invece di ${n.title}
                    const titleDisplay = n.pin ? `🔒 <b>${displayTitle}</b>` : `<b>${displayTitle}</b>`;
                    let folderName = '-';
                    if (n.folderId) {
                        const f = this.app.loggedUser.folders.find(folder => folder.id === n.folderId);
                        if (f) folderName = f.name;
                    }
                    return `<tr class="priority-${n.priority}" draggable="true" data-id="${n.id}" style="${bgColorStyle}" onclick="app.notes.openModalById(${n.id})" ondragstart="app.notes.handleTableDragStart(event, ${n.id})" ondragend="app.notes.handleTableDragEnd(event)"><td style="text-align:center;" onclick="event.stopPropagation(); app.notes.togglePin(${n.id})"><button class="icon-btn-small" style="background:none;border:none;cursor:pointer;font-size:1.2em;padding:0;">${n.isPinned ? '📌' : '📍'}</button></td><td>${titleDisplay}</td><td>📁 ${folderName}</td><td><span class="table-priority-badge priority-${n.priority}">${n.priority}</span></td></tr>`;
                }).join('')}</tbody></table>`;
                return container;
            };

            const pinned = activeNotes.filter(n => n.isPinned);
            const others = activeNotes.filter(n => !n.isPinned);

            if (pinned.length > 0) {
                if (pinnedTitle) pinnedTitle.classList.remove("hidden");
                listPinned.appendChild(createTable(pinned));
            } else {
                if (pinnedTitle) pinnedTitle.classList.add("hidden");
            }
            listAll.appendChild(createTable(others));
        }
        // 8. VISTA GRIGLIA
        else {
            const pinned = activeNotes.filter(n => n.isPinned);
            const others = activeNotes.filter(n => !n.isPinned);
            pinned.forEach(note => listPinned.appendChild(this.createCard(note)));
            others.forEach(note => listAll.appendChild(this.createCard(note)));
            if (pinnedTitle) pinnedTitle.classList.toggle("hidden", pinned.length === 0);
        }
    }

    /**
     * Innesca l'evento di trascinamento per una riga nella Vista Tabella.
     * @param {Event} e - L'evento drag nativo.
     * @param {string|number} id - L'ID della nota trascinata.
     */
    handleTableDragStart(e, id) {
        this.draggedNoteId = id;
        // Un piccolo delay per permettere al browser di creare "l'ombra" della riga trascinata
        setTimeout(() => { if (e.target) e.target.classList.add('dragging'); }, 0);

        const note = this.app.loggedUser.notes.find(n => n.id === id);
        if (!note) return;
        const isTrash = note.status === 'trashed';

        // Mostra l'overlay del Drag & Drop
        const overlay = document.getElementById("dragOverlay");
        const dzTrash = document.getElementById("dropZoneTrash");
        const dzRestore = document.getElementById("dropZoneRestore");
        const dzGeneral = document.getElementById("dropZoneGeneral");

        if (overlay) overlay.classList.add("visible");

        // Logica per mostrare i bottoni corretti in base a dove ci troviamo
        if (isTrash) {
            if (dzRestore) dzRestore.classList.remove("hidden");
            if (dzTrash) dzTrash.classList.add("hidden");
            if (dzGeneral) dzGeneral.classList.add("hidden");
        } else {
            if (dzTrash) dzTrash.classList.remove("hidden");
            if (dzRestore) dzRestore.classList.add("hidden");
            if (this.app.fileSystem.currentFolderId !== "root" && !note.pin) {
                if (dzGeneral) dzGeneral.classList.remove("hidden");
            } else {
                if (dzGeneral) dzGeneral.classList.add("hidden");
            }
        }
    }

    /**
     * Ripulisce l'interfaccia al termine del trascinamento di una riga dalla Tabella.
     * @param {Event} e - L'evento dragend nativo.
     */
    handleTableDragEnd(e) {
        e.currentTarget.classList.remove('dragging');
        this.draggedNoteId = null;
        document.getElementById("dragOverlay")?.classList.remove("visible");
        document.querySelectorAll('.drop-zone').forEach(dz => dz.classList.remove('drag-over'));
        document.querySelectorAll('.workspace-item').forEach(c => c.classList.remove('drag-over'));
    }

    /**
     * Aggiunge lo stile di evidenziazione quando una nota vola sopra una colonna Kanban.
     * @param {Event} e - L'evento dragover.
     */
    handleKanbanDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add("drag-over");
    }

    /**
     * Rimuove lo stile di evidenziazione quando una nota esce da una colonna Kanban.
     * @param {Event} e - L'evento dragleave.
     */
    handleKanbanDragLeave(e) {
        e.currentTarget.classList.remove("drag-over");
    }

    /**
     * Logica di rilascio nella vista Kanban. Cambia la priorità della nota
     * in base alla colonna in cui è stata rilasciata (effettuando controlli PIN se necessari).
     * @param {Event} e - L'evento drop.
     * @param {string} newPriority - La priorità di destinazione ('alta', 'media', 'bassa').
     */
    handleKanbanDrop(e, newPriority) {
        e.preventDefault();
        e.currentTarget.classList.remove("drag-over");

        // FIX: Usiamo il nostro tracciatore interno invece del dataTransfer nativo
        const noteId = this.draggedNoteId;
        if (!noteId) return;

        const note = this.app.loggedUser.notes.find(n => n.id == noteId);
        if (note && note.priority !== newPriority) {

            // CONTROLLO SICUREZZA: Se la nota è protetta da password (PIN numerico)
            if (note.pin) {
                const pinCheck = prompt("🔒 Questa nota è protetta. Inserisci il PIN per cambiarle priorità:");
                if (pinCheck !== note.pin) {
                    Utils.showToast("PIN errato! Spostamento annullato.");
                    return;
                }
            }

            // ESECUZIONE SPOSTAMENTO
            note.priority = newPriority; // Cambia fisicamente la priorità nel database

            this.app.saveUser();         // Salva i dati
            this.renderNotes();          // Ridisegna il Kanban all'istante
            this.app.updateStats();      // Aggiorna i grafici nel profilo utente

            Utils.showToast(`Priorità aggiornata: ${newPriority.toUpperCase()}`);
        }
    }

    /**
     * Genera un'animazione della nota che vola verso il pulsante del cestino e la elimina.
     * @param {string|number} id - L'ID della nota da cestinare.
     */
    animateAndDelete(id) {
        const trashNavBtn = document.querySelector('[data-page="cestino"]');
        this.animateAndExecute(id, trashNavBtn, () => this.moveToTrash(id));
    }

    /**
     * Apre la modale di una nota specifica, verificando prima se è protetta da un PIN.
     * @param {string|number} id - L'ID della nota da aprire.
     */
    openModalById(id) {
        const n = this.app.loggedUser.notes.find(x => x.id === id);
        if (n) { if (n.pin) this.promptPin(n); else this.openModal(n); }
    }


    /**
     * Salva silenziosamente i dati inseriti nel form di creazione nota all'interno del LocalStorage
     * per prevenire la perdita di dati in caso di refresh accidentale della pagina.
     */
    saveDraft() {
        if (!this.app.loggedUser) return;
        const draft = {
            title: document.getElementById("noteTitle").value, desc: document.getElementById("noteDesc").value,
            date: document.getElementById("noteDate").value, time: document.getElementById("noteTime").value,
            ws: document.getElementById("noteWorkspace").value, prio: document.getElementById("notePriority").value,
            tags: document.getElementById("noteTags").value, color: document.getElementById("noteColor").value,
            pin: document.getElementById("notePin").value, images: this.tempCreationImages
        };
        localStorage.setItem(`zenith_draft_${this.app.loggedUser.id}`, JSON.stringify(draft));
    }

    /**
     * Recupera (se presente) l'ultima bozza salvata nel LocalStorage e popola il form di creazione.
     */
    loadDraft() {
        if (!this.app.loggedUser) return;
        const saved = localStorage.getItem(`zenith_draft_${this.app.loggedUser.id}`);
        if (saved) {
            try {
                const draft = JSON.parse(saved);
                if (draft.title || draft.desc || draft.images.length > 0) {
                    document.getElementById("noteTitle").value = draft.title || ""; document.getElementById("noteDesc").value = draft.desc || "";
                    document.getElementById("noteDate").value = draft.date || ""; document.getElementById("noteTime").value = draft.time || "";
                    if (draft.ws) document.getElementById("noteWorkspace").value = draft.ws; if (draft.prio) document.getElementById("notePriority").value = draft.prio;
                    document.getElementById("noteTags").value = draft.tags || ""; document.getElementById("noteColor").value = draft.color || "#000000"; document.getElementById("notePin").value = draft.pin || "";
                    this.tempCreationImages = draft.images || []; this.renderCreationImages();
                    if (draft.desc) document.getElementById("noteDesc").dispatchEvent(new Event('input'));
                    Utils.showToast("Bozza ripristinata in automatico 📝");
                }
            } catch (e) { }
        }
    }

    /**
     * Elimina la bozza dal LocalStorage (chiamato dopo la creazione della nota).
     */
    clearDraft() { if (this.app.loggedUser) localStorage.removeItem(`zenith_draft_${this.app.loggedUser.id}`); }

    /**
     * Innesca il salvataggio automatico (se abilitato nelle impostazioni) usando un debounce timer
     * per evitare troppi salvataggi simultanei mentre l'utente digita.
     */
    triggerAutoSave() {
        if (!this.isEditing || !this.app.settings.autoSave) return;
        const statusEl = document.getElementById("modalAutoSaveStatus");
        statusEl.textContent = "Sto salvando... ⏳"; statusEl.style.color = "var(--badge-warn-t)";
        this.hasPendingSave = true;
        clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = setTimeout(() => {
            this.saveModified(true);
            statusEl.textContent = "Salvato ✅"; statusEl.style.color = "var(--badge-ok-t)";
            this.hasPendingSave = false;
        }, 1000);
    }

    /**
     * Gestisce la cancellazione "intelligente" dei blocchi Markdown.
     * Premendo backspace, elimina in un colpo solo l'intero blocco di codice (```)
     * e il suo contenuto se ci si trova alla fine del blocco.
     * @param {Event} e - L'evento keydown della tastiera.
     */
    handleFastDelete(e) {
        // Interviene solo se l'impostazione è attiva e si preme Backspace
        if (!this.app.settings.fastDelete || e.key !== 'Backspace') return;

        const el = e.target;
        const val = el.value;
        const pos = el.selectionStart;

        // Evita di intervenire se l'utente ha selezionato e sta cancellando più lettere manualmente
        if (pos !== el.selectionEnd) return;

        const textBeforeCursor = val.substring(0, pos);

        // --- 1. BLOCCO MULTILINEA (```) ---
        if (textBeforeCursor.endsWith('```')) {
            // Cerca i 3 backtick di apertura andando all'indietro
            const firstIndex = textBeforeCursor.lastIndexOf('```', textBeforeCursor.length - 4);

            e.preventDefault(); // Blocca l'eliminazione di un solo carattere

            if (firstIndex !== -1) {
                // Elimina TUTTO: dal primo ``` all'ultimo ``` compreso il testo dentro
                el.value = val.substring(0, firstIndex) + val.substring(pos);
                el.selectionStart = el.selectionEnd = firstIndex;
            } else {
                // Se non c'era apertura, elimina solo i 3 backtick finali
                el.value = val.substring(0, pos - 3) + val.substring(pos);
                el.selectionStart = el.selectionEnd = pos - 3;
            }
            return;
        }

        // --- 2. CODICE INLINEA (`) ---
        if (textBeforeCursor.endsWith('`') && !textBeforeCursor.endsWith('```')) {
            // Cerca il singolo backtick di apertura
            const firstIndex = textBeforeCursor.lastIndexOf('`', textBeforeCursor.length - 2);

            if (firstIndex !== -1) {
                e.preventDefault();
                // Elimina l'intero blocco inline compreso il testo
                el.value = val.substring(0, firstIndex) + val.substring(pos);
                el.selectionStart = el.selectionEnd = firstIndex;
                return;
            }
        }
    }

    /**
     * Aggiorna visivamente il contenitore delle miniature per le immagini caricate
     * durante la creazione di una nuova nota.
     */
    renderCreationImages() {
        const container = document.getElementById("creationImgPreview"); if (!container) return; container.innerHTML = "";
        this.tempCreationImages.forEach((imgSrc, index) => {
            const div = document.createElement("div"); div.className = "thumb-container";
            div.innerHTML = `<img src="${imgSrc}" alt="thumb"><div class="thumb-actions"><button title="Copertina" onclick="app.notes.setCreationCover(${index})">⭐</button><button title="Rimuovi" onclick="app.notes.removeCreationImage(${index})">🗑️</button></div>`;
            if (index === 0) div.style.border = "2px solid var(--accent)"; container.appendChild(div);
        });
    }

    /**
     * Sposta un'immagine in cima all'array, rendendola l'immagine di copertina (Cover) della nota.
     * @param {number} idx - Indice dell'immagine da promuovere.
     */
    setCreationCover(idx) { if (idx === 0) return; const img = this.tempCreationImages.splice(idx, 1)[0]; this.tempCreationImages.unshift(img); this.renderCreationImages(); this.saveDraft(); }

    /**
     * Rimuove un'immagine dall'array temporaneo durante la creazione.
     * @param {number} idx - Indice dell'immagine da rimuovere.
     */
    removeCreationImage(idx) { this.tempCreationImages.splice(idx, 1); this.renderCreationImages(); this.saveDraft(); }

    /**
     * Prende tutti i dati dal form della Dashboard e li salva definitivamente nel database come nuova Nota.
     */
    async addNote() {
        const title = document.getElementById("noteTitle").value.trim();
        if (!title) return Utils.showToast("Il titolo è obbligatorio!");
        const pin = document.getElementById("notePin").value.trim();
        if (pin.length > 0 && pin.length !== 5) return Utils.showToast("Errore: Il PIN deve essere di 5 cifre.");
        const d = document.getElementById("noteDate").value; const t = document.getElementById("noteTime").value;
        const finalDueDate = d ? (d + "T" + (t || "23:59")) : "";
        let rawTags = document.getElementById("noteTags").value.split(',').map(tag => tag.trim()).filter(tag => tag);
        let resolvedTags = this.app.tagManager ? this.app.tagManager.resolveAliases(rawTags) : rawTags;
        resolvedTags = [...new Set(resolvedTags)]; // Rimuove eventuali doppioni
        const descText = document.getElementById("noteDesc").value;
        const matches = [...descText.matchAll(/\[\[(.*?)\]\]/g)];
        const linkedTitles = matches.map(m => m[1].toLowerCase().trim());
        const linkedNoteIds = this.app.loggedUser.notes
            .filter(n => n.status !== 'trashed' && linkedTitles.includes(n.title.toLowerCase().trim()))
            .map(n => n.id);

        const newNote = {
            id: Date.now(), title, description: document.getElementById("noteDesc").value,
            folderId: document.getElementById("noteWorkspace").value || null, priority: document.getElementById("notePriority").value,
            dueDate: finalDueDate, tags: document.getElementById("noteTags").value.split(',').map(tag => tag.trim()).filter(tag => tag),
            tags: resolvedTags,
            images: [...this.tempCreationImages], color: document.getElementById("noteColor").value === "#000000" ? null : document.getElementById("noteColor").value,
            pin: pin && pin.length === 5 ? pin : null, status: 'active', isPinned: false, alerted: false, previousVersion: null
        };

        if (this.app.tagManager) {
            this.app.tagManager.registerTags(newNote.tags);
        }
        this.app.loggedUser.notes.unshift(newNote); this.app.saveUser();
        this.app.auth.populateProfile(); this.renderNotes(); this.app.updateStats(); this.app.calendar.render();

        ["noteTitle", "noteDesc", "noteDate", "noteTime", "noteTags", "noteImage", "notePin", "noteTemplate"].forEach(id => document.getElementById(id).value = "");
        document.getElementById("noteColor").value = "#000000"; document.getElementById("noteDescPreview").classList.add("hidden");
        this.tempCreationImages = []; this.renderCreationImages();
        this.clearDraft();

        Utils.showToast("Nota salvata!"); this.app.navigate('mie-note');
        this.app.saveUser();
        if (this.app.currentPage === 'mappa') this.app.graph.render(); // Aggiorna se visibile
        const g = this.app.gamification;
        if (g) {
            // Verifichiamo se la nota ha un contenuto minimo (es. 20 caratteri) per evitare spam
            if (newNote.description.length >= 20) {
                if (g.canGainDailyXP('notesCreated', 5)) {
                    g.addXP(50, "Nuova Nota");
                }
            }
            g.unlockBadge("first_note");
        }
    }

    /**
     * Esegue lo scambio fisico di posizione tra due note nell'array globale.
     * Usato sia nella vista a Griglia che nella vista KANBAN (se hanno la stessa priorità).
     * @param {string|number} draggedId - ID della nota spostata.
     * @param {string|number} targetId - ID della nota bersaglio.
     */
    reorderNotes(draggedId, targetId) {
        const list = this.app.loggedUser.notes;
        const draggedIndex = list.findIndex(n => n.id === draggedId);
        const targetIndex = list.findIndex(n => n.id === targetId);

        if (draggedIndex !== -1 && targetIndex !== -1) {
            const [draggedItem] = list.splice(draggedIndex, 1);
            list.splice(targetIndex, 0, draggedItem);
            this.swappedNotes = [String(draggedId), String(targetId)];
            this.app.saveUser();
            this.renderNotes();
            setTimeout(() => {
                this.swappedNotes = [];
                document.querySelectorAll('.anim-swap').forEach(el => el.classList.remove('anim-swap'));
            }, 1300);
        }
    }

    /**
     * Assegna una nota a una specifica cartella del File System (Workspace).
     * Se la nota proveniva dal Cestino, la ripristina automaticamente come attiva.
     * @param {string|number} id - L'ID della nota.
     * @param {string|null} folderId - L'ID della nuova cartella.
     */
    moveNoteToWorkspace(id, folderId) {
        const note = this.app.loggedUser.notes.find(n => n.id === id);
        if (note) {
            const wasInTrash = note.status === 'trashed';
            note.folderId = folderId || null; // Usa folderId invece di workspace
            note.status = 'active';
            note.trashedAt = null;
            this.app.saveUser(); this.renderNotes(); this.app.updateStats();
            Utils.showToast(wasInTrash ? "Nota ripristinata dal cestino!" : "Cartella aggiornata!");
            this.app.saveUser();
            if (this.app.currentPage === 'mappa') this.app.graph.render(); // Aggiorna se visibile
        }
    }

    /**
     * Crea una copia temporanea (clone) dell'elemento HTML della nota e lo fa "volare"
     * fluidamente verso le coordinate dell'elemento bersaglio prima di eseguire l'azione passata.
     * @param {string|number} id - ID della nota.
     * @param {HTMLElement} targetEl - Elemento DOM verso cui deve volare la nota.
     * @param {Function} actionCallback - Funzione da eseguire appena l'animazione termina.
     * @param {boolean} hideOriginal - Se 'true', nasconde la card originale per l'illusione di spostamento.
     */
    animateAndExecute(id, targetEl, actionCallback, hideOriginal = true) {
        const note = this.app.loggedUser.notes.find(n => n.id === id);
        if (!note) return;
        const card = document.querySelector(`[data-id="${id}"]`);
        if (card && targetEl) {
            const cardRect = card.getBoundingClientRect(); const targetRect = targetEl.getBoundingClientRect();
            const clone = card.cloneNode(true);
            clone.style.position = "fixed"; clone.style.left = cardRect.left + "px"; clone.style.top = cardRect.top + "px";
            clone.style.width = cardRect.width + "px"; clone.style.height = cardRect.height + "px";
            clone.style.zIndex = "9999"; clone.style.transition = "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)"; clone.style.margin = "0"; clone.style.pointerEvents = "none";
            document.body.appendChild(clone);
            if (hideOriginal) card.style.opacity = "0";
            void clone.offsetWidth;
            const deltaX = targetRect.left + (targetRect.width / 2) - (cardRect.left + (cardRect.width / 2));
            const deltaY = targetRect.top + (targetRect.height / 2) - (cardRect.top + (cardRect.height / 2));
            clone.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(0.1) rotate(15deg)`; clone.style.opacity = "0";
            setTimeout(() => { clone.remove(); actionCallback(); }, 400);
        } else { actionCallback(); }
    }

    /**
     * Costruisce dinamicamente l'elemento HTML "Card" per la visualizzazione a Griglia.
     * Gestisce la logica visiva di blur (PIN), colore di sfondo e aggancia gli eventi di Drag & Drop.
     * @param {Object} note - L'oggetto dati della Nota.
     * @param {boolean} isTrash - Modifica i pulsanti visibili se generato per la pagina Cestino.
     * @returns {HTMLElement} L'elemento DIV pronto da appendere nel DOM.
     */
    createCard(note, isTrash = false) {
        const card = document.createElement("div"); const noteIdStr = String(note.id);
        card.setAttribute('data-id', noteIdStr); card.className = `note-card priority-${note.priority || 'bassa'}`;
        if (this.swappedNotes && this.swappedNotes.includes(noteIdStr)) card.classList.add('anim-swap');
        if (note.pin) card.classList.add("protected"); if (note.color && !note.pin) { card.style.backgroundColor = note.color; card.style.borderColor = note.color; }
        let cover = note.images && note.images.length > 0 ? `<img src="${note.images[0]}" class="note-img">` : ``; let pinBtn = isTrash ? '' : `<div class="pin-icon" title="Fissa" style="cursor:pointer; z-index:20;">${note.isPinned ? '📌' : '📍'}</div>`;
        let timeText = note.dueDate ? `Scade: ${new Date(note.dueDate).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}` : ""; let lockOverlay = note.pin ? `<div class="protected-overlay">🔒</div>` : ''; 
        let rawDesc = note.description || "";
        let limit = 100;
        let previewText = rawDesc.substring(0, limit);
        
        // 🟢 RICERCA FULL-TEXT: Recupero termine e preparazione titoli/descrizioni
        const searchTerm = document.getElementById("searchInput")?.value.trim();
        let displayTitle = note.title;

        // Taglio intelligente della preview (già presente nel tuo codice)
        if (previewText.includes("[[") && !previewText.split("[[").pop().includes("]]")) {
            const remaining = rawDesc.substring(limit);
            const closeIndex = remaining.indexOf("]]");
            if (closeIndex !== -1) previewText += remaining.substring(0, closeIndex + 2);
        }

        let parsedDesc = note.pin ? "Contenuto bloccato." : Utils.parseMarkdown(previewText + (rawDesc.length > previewText.length ? '...' : ""));

        // 🟢 APPLICAZIONE EVIDENZIATORE
        if (searchTerm && !note.pin) {
            displayTitle = Utils.highlightText(displayTitle, searchTerm);
            parsedDesc = Utils.highlightText(parsedDesc, searchTerm);
        }

        // Generazione Tag (con evidenziazione)
        let tagsHTML = ''; 
        if (note.tags && note.tags.length > 0) { 
            tagsHTML = `<div class="note-tags">${note.tags.map(t => {
                const tagColor = (this.app && this.app.tagManager) ? this.app.tagManager.getColorForTag(t) : "var(--accent)";
                let displayTag = t;
                if (searchTerm && !note.pin) displayTag = Utils.highlightText(displayTag, searchTerm);
                return `<span class="tag-pill" data-tag="${t}" style="--tag-color: ${tagColor};">#${displayTag}</span>`;
            }).join('')}</div>`; 
        }
        
        // 🟢 IMPORTANTE: Usiamo ${displayTitle} invece di ${note.title}
// 🟢 IMPORTANTE: Usiamo ${displayTitle} invece di ${note.title}
        card.innerHTML = `${pinBtn} ${cover} ${lockOverlay}<div class="note-content"><div class="note-title">${displayTitle}</div><div class="note-desc" style="font-size:12px;">${parsedDesc}</div>${tagsHTML}<div class="note-meta"><span style="font-size: 11px; color: var(--text-2); font-weight: bold;">${timeText}</span><div class="action-btns" style="z-index:20;">${isTrash ? `<button class="restore-btn" title="Ripristina">♻️</button>` : ''}<button class="del-btn" title="${isTrash ? 'Elimina Ora' : 'Sposta in Cestino'}">🗑️</button></div></div></div>`;
        card.draggable = true;
        card.addEventListener('dragstart', (e) => {
            this.draggedNoteId = note.id; setTimeout(() => card.classList.add('dragging'), 0);
            const overlay = document.getElementById("dragOverlay"); const dzTrash = document.getElementById("dropZoneTrash"); const dzRestore = document.getElementById("dropZoneRestore"); const dzGeneral = document.getElementById("dropZoneGeneral");
            if (overlay) overlay.classList.add("visible");
            if (isTrash) { dzRestore.classList.remove("hidden"); dzTrash.classList.add("hidden"); dzGeneral.classList.add("hidden"); }
            else { dzTrash.classList.remove("hidden"); dzRestore.classList.add("hidden"); if (this.app.fileSystem.currentFolderId !== "root" && !note.pin) { dzGeneral.classList.remove("hidden"); } else { dzGeneral.classList.add("hidden"); } }
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging'); this.draggedNoteId = null;
            document.querySelectorAll('.note-card').forEach(c => c.classList.remove('drag-over'));
            document.getElementById("dragOverlay")?.classList.remove("visible");
            document.querySelectorAll('.drop-zone').forEach(dz => dz.classList.remove('drag-over'));
            document.querySelectorAll('.workspace-item').forEach(c => c.classList.remove('drag-over'));
        });
        // 1. GESTIONE HOVER (Mostra il bordo di scambio solo se le priorità sono uguali)
        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (this.draggedNoteId && this.draggedNoteId !== note.id) {
                const draggedNote = this.app.loggedUser.notes.find(n => n.id === this.draggedNoteId);

                // Se siamo in Kanban, permettiamo l'hover di scambio SOLO se la priorità è identica
                if (this.app.settings.viewMode === 'kanban') {
                    if (draggedNote && draggedNote.priority === note.priority) {
                        card.classList.add('drag-over');
                    }
                    // Se le priorità sono diverse, non aggiungiamo la classe (niente bordino blu)
                } else {
                    card.classList.add('drag-over');
                }
            }
        });
        card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
        // --- LOGICA DI RILASCIO (DROP) BLINDATA ---
        // 2. GESTIONE RILASCIO (Scambia se priorità uguale, cambia priorità se diversa)
        card.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            card.classList.remove('drag-over');

            if (this.draggedNoteId && this.draggedNoteId !== note.id) {
                const draggedNote = this.app.loggedUser.notes.find(n => n.id === this.draggedNoteId);
                if (!draggedNote) return;

                // LOGICA KANBAN
                if (this.app.settings.viewMode === 'kanban') {
                    if (draggedNote.priority !== note.priority) {
                        // PRIORITÀ DIVERSA: Cambia solo la proprietà della nota
                        if (draggedNote.pin) {
                            const pinCheck = prompt("🔒 Nota protetta. Inserisci il PIN per cambiare priorità:");
                            if (pinCheck !== draggedNote.pin) return Utils.showToast("PIN errato!");
                        }
                        draggedNote.priority = note.priority;
                        Utils.showToast(`Priorità aggiornata: ${note.priority.toUpperCase()}`);
                    } else {
                        // STESSA PRIORITÀ: Esegui lo scambio di posizione (reorder)
                        this.reorderNotes(this.draggedNoteId, note.id);
                    }
                } else {
                    // VISTA GRIGLIA: Scambia sempre
                    this.reorderNotes(this.draggedNoteId, note.id);
                }

                this.app.saveUser();
                this.renderNotes();
                this.app.updateStats();
            }
        });
        if (!isTrash) {
            card.addEventListener("click", () => { if (note.pin) this.promptPin(note); else this.openModal(note); });
            const pinEl = card.querySelector(".pin-icon"); if (pinEl) pinEl.addEventListener("click", (e) => { e.stopPropagation(); this.togglePin(note.id); });
            card.querySelectorAll('.tag-pill').forEach(pill => { 
            pill.addEventListener("click", (e) => { 
                e.stopPropagation(); 
                // 🟢 FIX: Usiamo currentTarget per leggere sempre il tag della pillola intera, ignorando i tag <mark> interni!
                this.triggerTagSearch(e.currentTarget.dataset.tag); 
            }); 
        });
        }
        card.querySelector(".del-btn").addEventListener("click", (e) => { e.stopPropagation(); if (isTrash) { this.app.loggedUser.notes = this.app.loggedUser.notes.filter(n => n.id !== note.id); this.app.saveUser(); this.renderNotes(); this.app.updateStats(); if (this.app.tagManager) {
                this.app.tagManager.renderSidebarTags();
                this.app.tagManager.renderDictionary();
            }} else { const trashNavBtn = document.querySelector('[data-page="cestino"]'); this.animateAndExecute(note.id, trashNavBtn, () => this.moveToTrash(note.id)); } });
        if (isTrash) { card.querySelector(".restore-btn").addEventListener("click", (e) => { e.stopPropagation(); const allNotesBtn = document.getElementById("navAllNotesBtn"); this.animateAndExecute(note.id, allNotesBtn, () => this.restore(note.id)); }); }
        return card;
    }

    /**
     * Apre la modale per richiedere il PIN prima di mostrare una nota protetta.
     * @param {Object} note - L'oggetto nota da sbloccare.
     */
    promptPin(note) { this.currentNoteId = note.id; document.getElementById("checkPinInput").value = ""; document.getElementById("pinPromptModal").classList.remove("hidden"); }

    /**
     * Verifica il PIN inserito contro quello salvato nella nota.
     */
    verifyPin() { const input = document.getElementById("checkPinInput").value; const note = this.app.loggedUser.notes.find(n => n.id === this.currentNoteId); if (note && note.pin === input) { document.getElementById("pinPromptModal").classList.add("hidden"); this.openModal(note); } else { Utils.showToast("PIN Errato!"); } }

    /** Sposta la nota nel Cestino o la vaporizza se l'autodistruzione è attiva. */
    moveToTrash(id) { const note = this.app.loggedUser.notes.find(n => n.id === id); if (note) { if (note.pin && this.app.settings.autoDestroy) { this.app.loggedUser.notes = this.app.loggedUser.notes.filter(n => n.id !== id); Utils.showToast("Nota vaporizzata all'istante!"); } else { note.status = 'trashed'; note.trashedAt = Date.now(); note.isPinned = false; Utils.showToast("Spostata nel cestino."); } this.app.saveUser(); this.renderNotes(); this.app.updateStats(); this.app.calendar.render(); if (this.app.tagManager) {
                this.app.tagManager.renderSidebarTags();
                this.app.tagManager.renderDictionary();
            }}}

    /** Ripristina la nota dal Cestino rimettendola nello stato attivo. */
    restore(id) { const note = this.app.loggedUser.notes.find(n => n.id === id); if (note) { note.status = 'active'; note.trashedAt = null; this.app.saveUser(); this.renderNotes(); this.app.updateStats(); this.app.calendar.render(); Utils.showToast("Nota ripristinata."); if (this.app.tagManager) {
                this.app.tagManager.renderSidebarTags();
                this.app.tagManager.renderDictionary();
            }} }

    /** Svuota definitivamente il Cestino eliminando tutti i record. */
    emptyTrash() { if (confirm("Svuotare il cestino?")) { this.app.loggedUser.notes = this.app.loggedUser.notes.filter(n => n.status !== 'trashed'); this.app.saveUser(); this.renderNotes(); this.app.updateStats(); Utils.showToast("Svuotato."); if (this.app.tagManager) {
                this.app.tagManager.renderSidebarTags();
                this.app.tagManager.renderDictionary();
                
            }
        if (this.app.gamification && this.app.gamification.checkCooldown('lastTrashEmpty', 24)) {
                this.app.gamification.addXP(30, "Pulizia Cestino");
                this.app.gamification.unlockBadge("trash_cleaner");
            }} }

    /** Attiva o disattiva l'ancoraggio (Pin) della nota in cima alla lista. */
    togglePin(id) { const note = this.app.loggedUser.notes.find(n => n.id === id); if (note) { note.isPinned = !note.isPinned; this.app.saveUser(); this.renderNotes(); } }

    /**
     * Apre la finestra modale grande mostrando il contenuto della Nota.
     * Pre-popola tutti i campi ed esegue il parsing del Markdown in HTML per la visualizzazione.
     * @param {Object} note - L'oggetto Nota.
     */
    openModal(note) {
        this.currentNoteId = note.id; this.isEditing = false; clearTimeout(this.autoSaveTimer); this.hasPendingSave = false;
        this.tempModalImages = [...(note.images || [])]; this.currentImgIndex = 0; this.renderModalImages();

        document.getElementById("modalTitle").value = note.title; document.getElementById("modalColor").value = note.color || "#000000"; document.getElementById("modalPin").value = note.pin || "";
        // FIX: Se la nota è vuota, mostra un messaggio invece di far collassare il layout
        // FIX: Se la nota è vuota, mostra un messaggio invece di far collassare il layout
        let parsedDesc = Utils.parseMarkdown(note.description);
        
        // 🟢 RICERCA FULL-TEXT: Evidenzia il termine nella modale aperta
        const searchTerm = document.getElementById("searchInput")?.value.trim();
        if (searchTerm && parsedDesc) {
            parsedDesc = Utils.highlightText(parsedDesc, searchTerm);
        }

        document.getElementById("modalRichTextDisplay").innerHTML = parsedDesc ? parsedDesc : '<span style="color: var(--text-3); font-style: italic;">📝 Nessuna descrizione... Clicca su "✏️ Modifica" per aggiungerne una.</span>';
        document.getElementById("modalRichTextDisplay").classList.remove("hidden");
        document.getElementById("modalDesc").value = note.description || ''; document.getElementById("modalDesc").classList.add("hidden");
        document.getElementById("modalWorkspace").value = note.folderId || ""; document.getElementById("modalPriority").value = note.priority || 'bassa';

        const tagsContainer = document.getElementById("modalTagsDisplay");
        // 🟢 NUOVO CODICE: Inietta il colore dinamico nella Modale
        if (note.tags && note.tags.length > 0) { 
            tagsContainer.innerHTML = note.tags.map(t => {
                const tagColor = (this.app && this.app.tagManager) ? this.app.tagManager.getColorForTag(t) : "var(--accent)";
                
                // 🟢 Evidenzia i tag anche dentro la modale!
                let displayTag = t;
                if (searchTerm) {
                    displayTag = Utils.highlightText(displayTag, searchTerm);
                }

                return `<span class="tag-pill" data-tag="${t}" style="--tag-color: ${tagColor};">#${displayTag}</span>`;
            }).join(''); 
            
            tagsContainer.querySelectorAll('.tag-pill').forEach(pill => { 
                pill.addEventListener("click", (e) => { 
                    // Se l'utente clicca direttamente sul testo <mark> evidenziato, dobbiamo risalire al vero data-tag
                    const targetTag = e.target.closest('.tag-pill').dataset.tag;
                    this.closeModal(); 
                    this.triggerTagSearch(targetTag); 
                }); 
            }); 
        } else { 
            tagsContainer.innerHTML = '<span style="font-size:12px; color:var(--text-3);">Nessun tag</span>'; 
        }
        const tagsInput = document.getElementById("modalTagsInput"); if (tagsInput) tagsInput.value = note.tags ? note.tags.join(', ') : '';

        if (note.dueDate) { const d = new Date(note.dueDate); const offset = d.getTimezoneOffset() * 60000; const localISOTime = (new Date(d - offset)).toISOString(); document.getElementById("modalDateOnly").value = localISOTime.split('T')[0]; document.getElementById("modalTimeOnly").value = localISOTime.split('T')[1].substring(0, 5); } else { document.getElementById("modalDateOnly").value = ""; document.getElementById("modalTimeOnly").value = ""; }

        document.getElementById("modalTimeMachineBtn").classList.toggle("hidden", !note.previousVersion);
        this.disableEdit();
        document.getElementById("noteModal").classList.remove("hidden");
    }

    /** Gestisce la visualizzazione delle immagini caricate nella parte sinistra della modale. */
    renderModalImages() { const imgEl = document.getElementById("modalImg"); const controls = document.getElementById("modalImgControls"); if (this.tempModalImages.length > 0) { imgEl.src = this.tempModalImages[this.currentImgIndex]; imgEl.style.display = 'block'; document.getElementById("imgCounter").textContent = `${this.currentImgIndex + 1}/${this.tempModalImages.length}`; controls.style.display = this.tempModalImages.length > 1 ? 'flex' : 'none'; } else { imgEl.style.display = 'none'; controls.style.display = 'none'; } }

    /** Scorre le immagini a destra o sinistra nella modale. */
    changeModalImage(dir) { if (this.tempModalImages.length === 0) return; this.currentImgIndex += dir; if (this.currentImgIndex < 0) this.currentImgIndex = this.tempModalImages.length - 1; if (this.currentImgIndex >= this.tempModalImages.length) this.currentImgIndex = 0; this.renderModalImages(); }

    /** Chiude la modale ed esegue un salvataggio finale se l'Auto-Save è attivo. */
    closeModal() {
        if (this.isEditing && this.hasPendingSave) this.saveModified(true);
        document.getElementById("noteModal").classList.add("hidden"); this.currentNoteId = null; this.tempModalImages = []; this.isEditing = false; clearTimeout(this.autoSaveTimer); this.hasPendingSave = false;
    }

    /**
     * Passa la modale dalla Modalità Lettura (Markdown generato e campi bloccati)
     * alla Modalità Scrittura (Editor testuale con campi sbloccati).
     */
    enableEdit() {
        this.isEditing = true;
        
        // Sblocca i campi solo se esistono
        ["modalTitle", "modalColor", "modalPin", "modalDateOnly", "modalTimeOnly", "modalPriority", "modalWorkspace", "modalTagsInput", "modalDesc"].forEach(id => { 
            const el = document.getElementById(id); 
            if (el) el.disabled = false; 
        });

        document.getElementById("modalRichTextDisplay")?.classList.add("hidden"); 
        const mDesc = document.getElementById("modalDesc");
        if (mDesc) { mDesc.classList.remove("hidden"); mDesc.disabled = false; }

        document.getElementById("modalEditBtn")?.classList.add("hidden");
        document.getElementById("modalImgEditControls")?.classList.remove("hidden");
        document.getElementById("modalTagsDisplay")?.classList.add("hidden"); 
        document.getElementById("modalTagsInput")?.classList.remove("hidden");
        document.getElementById("zenModalBtn")?.classList.remove("hidden");

        if (this.app.settings.autoSave) {
            document.getElementById("modalSaveBtn")?.classList.add("hidden");
            document.getElementById("autoSaveUiContainer")?.classList.remove("hidden");
            const status = document.getElementById("modalAutoSaveStatus");
            if (status) { status.textContent = "In attesa di modifiche..."; status.style.color = "var(--text-2)"; }
        } else {
            document.getElementById("modalSaveBtn")?.classList.remove("hidden");
            document.getElementById("autoSaveUiContainer")?.classList.add("hidden");
        }
    }

    /**
     * Termina la Modalità Scrittura della modale, converte le modifiche fatte
     * e blocca di nuovo i campi rendendoli di sola lettura.
     */
    disableEdit() {
        if (this.isEditing && this.hasPendingSave) { this.saveModified(true); this.hasPendingSave = false; }
        this.isEditing = false; clearTimeout(this.autoSaveTimer);
        document.getElementById("modalRichTextDisplay").innerHTML = Utils.parseMarkdown(document.getElementById("modalDesc").value);
        ["modalTitle", "modalColor", "modalPin", "modalDateOnly", "modalTimeOnly", "modalPriority", "modalWorkspace", "modalDesc", "modalTagsInput"].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = true; });
        
        document.getElementById("modalEditBtn").classList.remove("hidden"); 
        document.getElementById("modalSaveBtn").classList.add("hidden");
        document.getElementById("autoSaveUiContainer").classList.add("hidden");
        document.getElementById("modalImgEditControls").classList.add("hidden");
        document.getElementById("modalDesc").classList.add("hidden"); 
        document.getElementById("modalRichTextDisplay").classList.remove("hidden");
        document.getElementById("modalTagsDisplay").classList.remove("hidden"); 
        document.getElementById("modalTagsInput").classList.add("hidden");

        // 🟢 FIX BUG: Nasconde la stellina della Zen Mode quando si torna in sola lettura
        document.getElementById("zenModalBtn")?.classList.add("hidden");
    }

    /**
     * Salva permanentemente nel database le modifiche fatte a una nota aperta.
     * Crea un "backup storico" della versione precedente se l'Auto-Save non è attivo
     * per permetterne il ripristino con la Macchina del Tempo.
     * @param {boolean} silent - Se true, esegue il salvataggio in background senza popup o chiusura.
     */
    saveModified(silent = false) {
        const note = this.app.loggedUser.notes.find(n => n.id === this.currentNoteId);
        if (note) {
            const pin = document.getElementById("modalPin").value.trim();
            if (pin.length > 0 && pin.length !== 5 && !silent) return Utils.showToast("Errore: Il PIN deve essere di 5 cifre.");

            if (!this.app.settings.autoSave && !silent) note.previousVersion = { title: note.title, description: note.description, priority: note.priority, folderId: note.folderId, color: note.color, pin: note.pin, dueDate: note.dueDate, tags: note.tags };

            note.title = document.getElementById("modalTitle").value; note.description = document.getElementById("modalDesc").value;
            note.color = document.getElementById("modalColor").value === "#000000" ? null : document.getElementById("modalColor").value;
            note.pin = pin && pin.length === 5 ? pin : null;
            note.folderId = document.getElementById("modalWorkspace").value || null;
            delete note.workspace; 
            note.priority = document.getElementById("modalPriority").value;
            note.images = [...this.tempModalImages];
            // 🟢 NUOVO: Estrazione Link Bidirezionali in Modifica
            const descText = document.getElementById("modalDesc").value;
            const matches = [...descText.matchAll(/\[\[(.*?)\]\]/g)];
            const linkedTitles = matches.map(m => m[1].toLowerCase().trim());
            note.linkedNoteIds = this.app.loggedUser.notes
                .filter(n => n.status !== 'trashed' && linkedTitles.includes(n.title.toLowerCase().trim()))
                .map(n => n.id);
            
            // 🟢 FIX SINONIMI
            const tagsInputStr = document.getElementById("modalTagsInput").value;
            let rawTags = tagsInputStr.split(',').map(tag => tag.trim()).filter(tag => tag);
            let resolvedTags = (this.app && this.app.tagManager) ? this.app.tagManager.resolveAliases(rawTags) : rawTags;
            note.tags = [...new Set(resolvedTags)];

            const d = document.getElementById("modalDateOnly").value; const t = document.getElementById("modalTimeOnly").value;
            note.dueDate = d ? (d + "T" + (t || "23:59")) : "";

            if (this.app.tagManager) {
                this.app.tagManager.registerTags(note.tags);
            }
            this.app.saveUser(); this.renderNotes(); this.app.updateStats(); this.app.calendar.render();
            if (!silent) { Utils.showToast("Nota aggiornata!"); this.closeModal(); }
        }
    }

    /**
     * Sostituisce il contenuto corrente della nota con la versione di "backup" precedente.
     * (Usato dal pulsante "Ripristina Versione Precedente").
     */
    restoreVersion() {
        const note = this.app.loggedUser.notes.find(n => n.id === this.currentNoteId);
        if (note && note.previousVersion) {
            Object.assign(note, note.previousVersion); note.previousVersion = null;
            this.app.saveUser(); this.renderNotes(); this.app.updateStats(); this.app.calendar.render();
            this.closeModal(); Utils.showToast("Versione ripristinata!");
        }
    }
    /** Attiva o disattiva la modalità Focus (Galassia) e la musica */
    /**
     * Attiva o disattiva la modalità Focus (Galassia).
     * @param {string} textareaId - L'ID della textarea da ingrandire a tutto schermo.
     */
    /** Inserisci questo aggiornamento dei metodi esistenti */

    enterZenMode(sourceId) {
        const overlay = document.getElementById("zen-overlay");
        const source = document.getElementById(sourceId);
        const zenEditor = document.getElementById("zen-editor-area");

        if (!overlay || !source || !zenEditor) return;

        this.isZenMode = true;
        this.activeSourceId = sourceId;
        zenEditor.value = source.value;

        // Blocca i click dell'utente
        document.body.classList.add("zen-transitioning");
        
        // Avvia la transizione visiva (che dura 1.5s grazie al CSS)
        overlay.classList.add("active");

        // 🟢 Sblocca tutto ESATTAMENTE dopo 1.5 secondi (1500ms)
        setTimeout(() => {
            document.body.classList.remove("zen-transitioning");
            zenEditor.focus();
        }, 1500); 
    }

    exitZenMode() {
        if (!this.isZenMode) return;
        
        const overlay = document.getElementById("zen-overlay");
        const source = document.getElementById(this.activeSourceId);
        const zenEditor = document.getElementById("zen-editor-area");

        if (source && zenEditor) {
            source.value = zenEditor.value;
            source.dispatchEvent(new Event('input'));
        }

        // Blocca i click
        document.body.classList.add("zen-transitioning");
        
        // Avvia la transizione di chiusura
        overlay.classList.remove("active");

        // 🟢 Ripulisce ESATTAMENTE dopo 1.5 secondi (1500ms)
        setTimeout(() => {
            document.body.classList.remove("zen-transitioning");
            this.isZenMode = false;
        }, 1500);
    }
    /**
     * Avvia una ricerca rapida globale filtrando tutte le note in base a un tag cliccato.
     * @param {string} tag - Il testo del tag.
     */
    triggerTagSearch(tag) { 
        const searchInput = document.getElementById("searchInput"); 
        if (searchInput) { 
            searchInput.value = tag || ""; 
            
            // 🟢 Ci assicuriamo di cercare in tutto l'account uscendo dalle sottocartelle
            if (this.app.fileSystem) {
                this.app.fileSystem.currentFolderId = 'root';
            }

            // Torna alla pagina corretta e applica il filtro
            this.app.navigate('mie-note'); 
            this.renderNotes(); 
        } 
    }
    /** 🟢 Trova e apre una nota per titolo (senza parentesi) */
    openModalByTitle(title) {
        const note = this.app.loggedUser.notes.find(n => 
            n.title.toLowerCase().trim() === title.toLowerCase().trim() && 
            n.status !== 'trashed'
        );
        
        if (note) {
            // Chiude la modale attuale se ne stiamo aprendo una da un link interno
            document.getElementById("noteModal").classList.add("hidden");
            setTimeout(() => this.openModalById(note.id), 50);
        } else {
            Utils.showToast(`Nota "${title}" non trovata 🔍`);
        }
    }
    /** 🟢 Gestisce l'autocompletamento dei link [[...]] *
    handleAutocomplete(textarea) {
        if (this.app.settings.enableAutocomplete === false) return;

        const pos = textarea.selectionStart;
        const text = textarea.value.substring(0, pos);
        
        // Cerca la presenza di "[[" prima del cursore
        const triggerMatch = text.match(/\[\[([^\]\n]*)$/);
        
        if (triggerMatch) {
            const query = triggerMatch[1].toLowerCase(); // Testo scritto dopo [[
            this.targetTextarea = textarea;
            
            // Filtra le note per titolo (escludendo le cestinate)
            this.filteredNotes = this.app.loggedUser.notes.filter(n => 
                n.status !== 'trashed' && 
                n.title.toLowerCase().includes(query)
            ).slice(0, 5); // Mostriamo solo i primi 5 suggerimenti

            if (this.filteredNotes.length > 0) {
                this.showAutocompleteMenu(query);
            } else {
                this.closeAutocomplete();
            }
        } else {
            this.closeAutocomplete();
        }
    }

    /** 🟢 Disegna il menù con i risultati *
    showAutocompleteMenu(query) {
        const menu = document.getElementById("autocomplete-menu");
        if (!menu) return;

        this.autocompleteActive = true;
        this.autocompleteIndex = 0;
        
        menu.innerHTML = this.filteredNotes.map((note, i) => `
            <div class="autocomplete-item ${i === 0 ? 'selected' : ''}" data-index="${i}">
                <span>📄</span> ${note.title}
            </div>
        `).join('');

        menu.classList.remove("hidden");

        // Aggiunge click sugli elementi
        menu.querySelectorAll(".autocomplete-item").forEach(item => {
            item.onclick = () => this.insertLink(this.filteredNotes[item.dataset.index].title);
        });
    }

    /** 🟢 Inserisce il link completo nella nota *
    insertLink(title) {
        if (!this.targetTextarea) return;

        const pos = this.targetTextarea.selectionStart;
        const text = this.targetTextarea.value;
        
        // Trova dove inizia il [[ per sostituirlo
        const before = text.substring(0, pos).replace(/\[\[[^\]\n]*$/, '');
        const after = text.substring(pos);
        
        this.targetTextarea.value = before + "[[" + title + "]] " + after;
        
        // Riposiziona il cursore dopo il link
        const newPos = before.length + title.length + 5;
        this.targetTextarea.setSelectionRange(newPos, newPos);
        this.targetTextarea.focus();
        
        this.closeAutocomplete();
        
        // Se l'auto-save è attivo, scatena il salvataggio
        if (this.app.settings.autoSave) this.handleAutoSave();
    }

    closeAutocomplete() {
        this.autocompleteActive = false;
        document.getElementById("autocomplete-menu")?.classList.add("hidden");
    }
    updateAutocompleteSelection() {
        const menu = document.getElementById("autocomplete-menu");
        menu.querySelectorAll(".autocomplete-item").forEach((item, i) => {
            item.classList.toggle("selected", i === this.autocompleteIndex);
        });
    }*/
}