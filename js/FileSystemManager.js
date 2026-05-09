/**
 * @class FileSystemManager
 * @description Gestisce l'architettura relazionale delle cartelle (Workspace e Sottocartelle),
 * l'albero di navigazione nella sidebar e le funzionalità di migrazione dati dal vecchio sistema.
 */
class FileSystemManager {
    /**
     * Inizializza il FileSystem.
     * @param {Object} app - L'istanza principale dell'applicazione (NoteFlowApp).
     */
    constructor(app) {
        this.app = app;
        this.currentFolderId = "root"; // "root" significa "Tutte le Note"
        this.expandedFolders = new Set(); // Tiene traccia di quali cartelle sono aperte nella UI
    }

    /**
     * Avvia il gestore delle cartelle assicurandosi che la struttura dati esista
     * nell'oggetto utente e avviando le procedure di migrazione se necessarie.
     */
    init() {
        if (!this.app.loggedUser) return;

        // FIX CRITICO: Se per qualche motivo folders è sparito, lo ricreiamo subito
        if (!this.app.loggedUser.folders) {
            this.app.loggedUser.folders = [];
        }

        this.migrateDataIfNeeded();
    }

    /**
     * Collega gli ascoltatori di eventi base (es. pulsante per creare la cartella root).
     */
    initEvents() {
        // I bottoni per ora rimangono gli stessi del vecchio sistema
        document.getElementById("addWorkspaceBtn")?.addEventListener("click", () => this.addFolderPrompt(null));
    }

    /**
     * --- 1. MIGRAZIONE DATI (Silenziosa e sicura) ---
     * Controlla se l'utente sta usando il vecchio sistema array lineare ("workspaces").
     * In tal caso, converte tutte le vecchie stringhe in oggetti Cartella veri e propri
     * con ID univoco, aggiornando di conseguenza i riferimenti all'interno delle note.
     */
    migrateDataIfNeeded() {
        const user = this.app.loggedUser;

        // Se l'utente ha già il nuovo array "folders", la migrazione è già stata fatta
        if (user.folders) return;

        console.log("🛠️ Esecuzione migrazione dati verso File System...");
        user.folders = [];

        // Se ha dei vecchi workspaces (array di stringhe)
        if (user.workspaces && Array.isArray(user.workspaces)) {
            user.workspaces.forEach(wsName => {
                if (wsName === "Generale") return; // Ignoriamo "Generale"

                const newFolderId = "f_" + Date.now() + Math.random().toString(36).substr(2, 5);
                user.folders.push({
                    id: newFolderId,
                    name: wsName,
                    parentId: null // Le vecchie cartelle diventano tutte Root
                });

                // Aggiorna tutte le note che appartenevano a quel workspace
                user.notes.forEach(note => {
                    if (note.workspace === wsName) {
                        note.folderId = newFolderId; // Nuovo sistema
                        delete note.workspace;       // Rimuovi vecchio campo
                    }
                });
            });
        }

        // Pulizia finale delle note rimaste senza cartella
        user.notes.forEach(note => {
            if (note.workspace || note.workspace === "") {
                note.folderId = null;
                delete note.workspace;
            }
        });

        // Elimina il vecchio array
        delete user.workspaces;
        this.app.saveUser();
        console.log("✅ Migrazione completata con successo!");
    }

    /**
     * --- 2. GESTIONE DATI (CRUD) ---
     * Crea una nuova cartella nel database locale assegnandole un ID generato.
     * @param {string} name - Il nome della cartella inserito dall'utente.
     * @param {string|null} [parentId=null] - ID della cartella madre (se è una sottocartella) o null se è nella root.
     */
    createFolder(name, parentId = null) {
        if (!name || name.trim().length === 0) return;
        const newFolderId = "f_" + Date.now() + Math.random().toString(36).substr(2, 5);

        this.app.loggedUser.folders.push({
            id: newFolderId,
            name: name.trim(),
            parentId: parentId
        });

        if (parentId) this.expandedFolders.add(parentId);

        this.app.saveUser();
        this.renderSidebar();
        this.updateSelects();
        if (this.app.notes) this.app.notes.renderNotes();
        Utils.showToast("Cartella creata!");
        
        // 🎮 GAMIFICATION: Premio XP con limite giornaliero di 3
        const g = this.app.gamification;
        if (g) {
            if (g.canGainDailyXP('foldersCreated', 3)) {
                g.addXP(15, "Nuova Cartella");
            }
            g.unlockBadge("first_folder"); // Il badge si sblocca comunque alla prima
        }

        if (this.app.currentPage === 'mappa') this.app.graph.render();
    }
    /**
     * Elimina una cartella e l'intero suo ramo (tutte le sottocartelle discendenti).
     * Le note contenute non vengono cancellate, ma spostate alla root ("Tutte le Note").
     * @param {string} folderId - L'ID univoco della cartella da eliminare.
     */
    deleteFolder(folderId) {
        const folder = this.app.loggedUser.folders.find(f => f.id === folderId);
        if (!folder) return;

        if (confirm(`Sei sicuro di voler eliminare la cartella "${folder.name}" e tutte le sue sottocartelle? Le note all'interno andranno in "Tutte le Note".`)) {
            // Troviamo tutti gli ID di questa cartella e dei suoi "discendenti" (figli, nipoti, ecc.)
            const idsToDelete = this.getDescendantIds(folderId);
            idsToDelete.push(folderId);

            // Rimuoviamo le cartelle dal database
            this.app.loggedUser.folders = this.app.loggedUser.folders.filter(f => !idsToDelete.includes(f.id));

            // Orfanizziamo le note (le mandiamo in Root)
            this.app.loggedUser.notes.forEach(note => {
                if (idsToDelete.includes(note.folderId)) {
                    note.folderId = null;
                }
            });

            if (idsToDelete.includes(this.currentFolderId)) this.currentFolderId = "root";

            this.app.saveUser();
            this.renderSidebar();
            this.updateSelects();
            if (document.getElementById("page-mie-note").classList.contains("active")) this.app.navigate('mie-note');

            if (this.app.currentPage === 'mappa') this.app.graph.render(); // Aggiorna se visibile
        }
    }

    /**
     * Trova tutti gli ID delle cartelle figlie e dei loro discendenti in modo ricorsivo.
     * @param {string} parentId - L'ID della cartella di partenza.
     * @returns {string[]} Array contenente gli ID di tutti i discendenti.
     */
    getDescendantIds(parentId) {
        let descendantIds = [];
        const children = this.app.loggedUser.folders.filter(f => f.parentId === parentId);
        children.forEach(child => {
            descendantIds.push(child.id);
            descendantIds = descendantIds.concat(this.getDescendantIds(child.id));
        });
        return descendantIds;
    }

    /**
     * --- 3. UTILITIES PER L'INTERFACCIA ---
     * Mostra un prompt testuale per richiedere all'utente il nome della cartella da creare.
     * @param {string|null} [parentId=null] - L'ID del nodo genitore opzionale.
     */
    addFolderPrompt(parentId = null) {
        const name = prompt("Nome della nuova cartella:");
        if (name) this.createFolder(name, parentId);
    }

    /**
     * Apre un prompt per permettere all'utente di modificare il nome di una cartella.
     * @param {string} folderId - L'ID della cartella da rinominare.
     */
    renameFolderPrompt(folderId) {
        const folder = this.app.loggedUser.folders.find(f => f.id === folderId);
        if (!folder) return;
        const newName = prompt("Inserisci il nuovo nome per la cartella:", folder.name);
        if (newName && newName.trim().length > 0) {
            folder.name = newName.trim();
            this.app.saveUser();
            this.renderSidebar();
            this.updateSelects();
            this.app.notes.renderNotes(); // Rinfresca il titolo se siamo dentro
            Utils.showToast("Cartella rinominata!");

            if (this.app.currentPage === 'mappa') this.app.graph.render(); // Aggiorna se visibile
        }
    }

    /**
     * Calcola il percorso (breadcrumb) risalendo l'albero partendo da una cartella specifica.
     * @param {string} folderId - L'ID della cartella destinazione.
     * @returns {Array<{id: string, name: string}>} L'array del percorso ordinato, iniziando da "Tutte le Note".
     */
    getBreadcrumbPath(folderId) {
        if (folderId === "root" || !folderId) return [{ id: "root", name: "Tutte le Note" }];

        let path = [];
        let currentId = folderId;

        // Risale l'albero fino alla root
        while (currentId) {
            const folder = this.app.loggedUser.folders.find(f => f.id === currentId);
            if (folder) {
                path.unshift({ id: folder.id, name: folder.name });
                currentId = folder.parentId;
            } else {
                break; // Sicurezza per evitare loop
            }
        }

        path.unshift({ id: "root", name: "Tutte le Note" });
        return path;
    }

    /**
     * Apre e mostra i contenuti di una determinata cartella, gestendo la navigazione della UI,
     * il salvataggio dello stato per i ricaricamenti pagina e costruendo la breadcrumb dinamica.
     * @param {string} folderId - L'ID della cartella da mostrare ("root" mostra tutto il database).
     */
    showFolder(folderId) {
        if (this.app.settingsMgr.revertPreview) this.app.settingsMgr.revertPreview();
        this.currentFolderId = folderId;

        // SALVATAGGIO STATO: Ricorda l'ID della cartella specifica
        localStorage.setItem("noteFlow_lastFolderId", folderId);
        localStorage.setItem("noteFlow_lastPage", "mie-note"); // Assicura che la pagina sia corretta
        // Gestione Navigazione UI
        document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
        document.getElementById("page-mie-note").classList.add("active");
        document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
        document.querySelector(`[data-page="mie-note"]`)?.classList.add("active");

        this.renderSidebar();

        // FIX: BREADCRUMBS INTERATTIVI
        const path = this.getBreadcrumbPath(folderId);
        const topbarTitle = document.getElementById("topbar-title");
        topbarTitle.innerHTML = ""; // Pulizia

        path.forEach((p, index) => {
            const span = document.createElement("span");
            span.className = "breadcrumb-item";
            span.textContent = p.name;
            span.onclick = () => this.showFolder(p.id);
            topbarTitle.appendChild(span);

            if (index < path.length - 1) {
                const sep = document.createElement("span");
                sep.className = "breadcrumb-separator";
                sep.textContent = "/";
                topbarTitle.appendChild(sep);
            }
        });

        this.app.notes.renderNotes();
    }

    /**
     * --- 4. RENDER RICORSIVO (Albero Reale) ---
     * Funzione che disegna fisicamente l'albero di navigazione delle cartelle nella sidebar.
     * Si richiama da sola (ricorsione) per calcolare l'indentazione corretta per figli, nipoti, ecc.
     * @param {string|null} [parentId=null] - L'ID del nodo di partenza (null = Root).
     * @param {HTMLElement} [container=document.getElementById("sidebarWorkspaces")] - Il div bersaglio nell'HTML.
     * @param {number} [level=0] - Contatore della profondità dell'albero, usato per i margini CSS.
     */
    /**
     * --- 4. RENDER RICORSIVO CON TENDINE (METODO SICURO) ---
     */
    /**
     * Rende la barra laterale delle cartelle (Supporta Sottocartelle e Tendine)
     */
    renderSidebar(parentId = null, container = document.getElementById("sidebarWorkspaces"), level = 0) {
        if (!container) return;
        if (level === 0) container.innerHTML = "";

        if (!this.app.loggedUser || !this.app.loggedUser.folders) return;

        // Filtra solo le cartelle di questo livello
        const folders = this.app.loggedUser.folders.filter(f => f.parentId === parentId);

        folders.forEach(folder => {
            // Controlla se questa cartella ha delle figlie
            const hasChildren = this.app.loggedUser.folders.some(f => f.parentId === folder.id);

            const folderDiv = document.createElement("div");
            folderDiv.className = "workspace-folder";
            if (hasChildren) folderDiv.classList.add("has-children");

            const itemDiv = document.createElement("div");
            itemDiv.className = `workspace-item ${this.currentFolderId === folder.id ? 'active' : ''}`;
            itemDiv.style.paddingLeft = `${level * 12}px`;

            const icon = level > 0 ? '<span class="sidebar-depth-indicator">↳</span>' : '📁 ';

            itemDiv.innerHTML = `
                <div class="ws-left" style="display: flex; align-items: center; overflow: hidden; flex: 1;">
                    ${icon}
                    <span class="ws-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-left: 5px;">${folder.name}</span>
                    
                    ${hasChildren ? `
                    <button class="ws-toggle-btn" title="Espandi/Comprimi" style="flex-shrink: 0; margin-left: 2px; background: transparent; border: none; padding: 2px; cursor: pointer; display: flex; align-items: center; opacity: 0.8;">
                        <svg viewBox="0 0 24 24" width="18" height="18" stroke="#ffffff" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.3s ease; pointer-events: none;">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>
                    ` : ''}
                </div>

                <div class="ws-right" style="display: flex; gap: 8px; flex-shrink: 0;">
                    <button class="ws-action-btn btn-add-sub" title="Aggiungi sottocartella" style="background:transparent; border:none; cursor:pointer;">➕</button>
                    <button class="workspace-del-btn btn-delete-ws" title="Elimina" style="background:transparent; border:none; cursor:pointer; color:var(--badge-err-t);">✖</button>
                </div>
            `;
            
            // Eventi Click (con stopPropagation per non accavallarli)
            itemDiv.onclick = () => this.showFolder(folder.id);

            const toggleBtn = itemDiv.querySelector('.ws-toggle-btn');
            if (toggleBtn) {
                toggleBtn.onclick = (e) => {
                    e.stopPropagation();
                    folderDiv.classList.toggle('collapsed');
                };
            }

            const addBtn = itemDiv.querySelector('.btn-add-sub');
            if (addBtn) {
                addBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.addFolderPrompt(folder.id);
                };
            }

            const delBtn = itemDiv.querySelector('.btn-delete-ws');
            if (delBtn) {
                delBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.deleteFolder(folder.id);
                };
            }

            folderDiv.appendChild(itemDiv);

            // Generazione Ricorsiva (disegna le figlie DENTRO la tendina)
            if (hasChildren) {
                const subfoldersDiv = document.createElement("div");
                subfoldersDiv.className = "ws-subfolders";
                this.renderSidebar(folder.id, subfoldersDiv, level + 1);
                folderDiv.appendChild(subfoldersDiv);
            }

            container.appendChild(folderDiv);
        });
    }

    /**
     * Aggiorna programmaticamente tutti i menu a tendina (<select>) dell'applicazione
     * (es. nel modulo di creazione nota o nella modale di modifica) con le cartelle correnti.
     */
    updateSelects() {
        const selects = [document.getElementById("noteWorkspace"), document.getElementById("modalWorkspace")];
        const folders = this.app.loggedUser.folders || [];

        // Per ora li buttiamo dentro come lista piatta
        const optionsHtml = `<option value="">Nessuna Cartella</option>` +
            folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('');

        selects.forEach(select => { if (select) select.innerHTML = optionsHtml; });
    }
}