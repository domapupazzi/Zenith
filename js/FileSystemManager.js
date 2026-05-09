/**
 * @class FileSystemManager
 * @description Gestisce l'intera architettura relazionale delle cartelle (Workspace e Sottocartelle),
 * inclusa l'interfaccia ad albero (tree view) nella sidebar, la breadcrumb di navigazione
 * superiore e la logica di migrazione retroattiva dal vecchio sistema piatto.
 */
class FileSystemManager {
    /**
     * Costruttore: Inizializza il File System.
     * @param {Object} app - L'istanza principale dell'applicazione (ZenithEngine).
     */
    constructor(app) {
        this.app = app;
        // 'root' rappresenta la vista globale ("Tutte le Note")
        this.currentFolderId = "root"; 
        
        // Traccia lo stato di espansione (Accordion) delle cartelle nella sidebar
        this.expandedFolders = new Set(); 
    }

    /**
     * Avvia il gestore: verifica che la struttura dati esista nell'account utente
     * e lancia la procedura di controllo/migrazione dei vecchi dati.
     */
    init() {
        if (!this.app.loggedUser) return;

        // Fallback di sicurezza: ricrea l'array folders se corrotto o assente
        if (!this.app.loggedUser.folders) {
            this.app.loggedUser.folders = [];
        }

        this.migrateDataIfNeeded();
    }

    /**
     * Collega gli ascoltatori di eventi dell'interfaccia (es. creazione cartella Root).
     */
    initEvents() {
        document.getElementById("addWorkspaceBtn")?.addEventListener("click", () => this.addFolderPrompt(null));
    }

    /**
     * Controlla se l'utente utilizza ancora il vecchio sistema lineare "workspaces" (Array di stringhe).
     * Se sì, converte le vecchie cartelle in nuovi Oggetti relazionali con ID univoci
     * e aggiorna tutti i riferimenti all'interno delle note esistenti.
     */
    migrateDataIfNeeded() {
        const user = this.app.loggedUser;

        // Migrazione già completata se esiste l'array corretto
        if (user.folders) return;

        console.log("🛠️ Esecuzione migrazione dati verso File System relazionale...");
        user.folders = [];

        if (user.workspaces && Array.isArray(user.workspaces)) {
            user.workspaces.forEach(wsName => {
                // "Generale" viene bypassato (le note senza cartella finiscono automaticamente in Root)
                if (wsName === "Generale") return; 

                const newFolderId = "f_" + Date.now() + Math.random().toString(36).substring(2, 7);
                user.folders.push({
                    id: newFolderId,
                    name: wsName,
                    parentId: null 
                });

                // Aggiornamento bulk delle note associate a questa vecchia cartella
                user.notes.forEach(note => {
                    if (note.workspace === wsName) {
                        note.folderId = newFolderId; 
                        delete note.workspace;       
                    }
                });
            });
        }

        // Pulizia: le vecchie note rimaste nel limbo vengono riportate in Root
        user.notes.forEach(note => {
            if (note.workspace || note.workspace === "") {
                note.folderId = null;
                delete note.workspace;
            }
        });

        // Distruzione del vecchio sistema
        delete user.workspaces;
        this.app.saveUser();
        console.log("✅ Migrazione File System completata con successo!");
    }

    /**
     * Crea un nuovo nodo cartella nel database e aggiorna la UI e i punteggi.
     * @param {string} name - Il nome assegnato dall'utente alla cartella.
     * @param {string|null} [parentId=null] - L'ID della cartella genitrice (null = livello Root).
     */
    createFolder(name, parentId = null) {
        if (!name || name.trim().length === 0) return;
        
        const newFolderId = "f_" + Date.now() + Math.random().toString(36).substring(2, 7);

        this.app.loggedUser.folders.push({
            id: newFolderId,
            name: name.trim(),
            parentId: parentId
        });

        // Espande automaticamente la cartella madre appena ha un figlio
        if (parentId) this.expandedFolders.add(parentId);

        this.app.saveUser();
        this.renderSidebar();
        this.updateSelects();
        if (this.app.notes) this.app.notes.renderNotes();
        
        if (typeof Utils !== 'undefined') Utils.showToast("Cartella creata!");
        
        // Gamification Hook: Esperienza per creazione cartelle
        const gamification = this.app.gamification;
        if (gamification) {
            if (gamification.canGainDailyXP('foldersCreated', 3)) {
                gamification.addXP(15, "Nuova Cartella");
            }
            gamification.unlockBadge("first_folder"); 
        }

        // Graph Hook: Aggiorna i nodi se l'utente è sulla pagina della mappa neurale
        if (this.app.currentPage === 'mappa' && this.app.graph) {
            this.app.graph.render();
        }
    }

    /**
     * Elimina ricorsivamente una cartella e tutto il suo ramo discendente.
     * Le note fisiche non vengono cancellate, ma "orfanizzate" per sicurezza, tornando in Root.
     * @param {string} folderId - L'ID della cartella target.
     */
    deleteFolder(folderId) {
        const folder = this.app.loggedUser.folders.find(f => f.id === folderId);
        if (!folder) return;

        const isConfirmed = confirm(`Sei sicuro di voler eliminare la cartella "${folder.name}" e tutte le sue sottocartelle? Le note all'interno andranno salvate in "Tutte le Note".`);
        if (isConfirmed) {
            const idsToDelete = this.getDescendantIds(folderId);
            idsToDelete.push(folderId);

            // Rimozione fisica cartelle dal database
            this.app.loggedUser.folders = this.app.loggedUser.folders.filter(f => !idsToDelete.includes(f.id));

            // Protezione dati: le note vengono sganciate dalle cartelle eliminate
            this.app.loggedUser.notes.forEach(note => {
                if (idsToDelete.includes(note.folderId)) {
                    note.folderId = null;
                }
            });

            // Se l'utente era all'interno di una cartella eliminata, viene ributtato in Root
            if (idsToDelete.includes(this.currentFolderId)) {
                this.currentFolderId = "root";
            }

            this.app.saveUser();
            this.renderSidebar();
            this.updateSelects();
            
            if (document.getElementById("page-mie-note")?.classList.contains("active")) {
                this.app.navigate('mie-note');
            }

            if (this.app.currentPage === 'mappa' && this.app.graph) {
                this.app.graph.render(); 
            }
        }
    }

    /**
     * Calcola in modo ricorsivo l'albero di tutti i discendenti di un nodo.
     * @param {string} parentId - L'ID del nodo di partenza.
     * @returns {string[]} Array contenente gli ID di tutti i discendenti (figli, nipoti...).
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
     * Innesca un prompt nativo del browser per richiedere l'inserimento
     * del nome di una nuova cartella in fase di creazione.
     * @param {string|null} [parentId=null] - ID della cartella madre.
     */
    addFolderPrompt(parentId = null) {
        const name = prompt("Nome della nuova cartella:");
        if (name) this.createFolder(name, parentId);
    }

    /**
     * Innesca un prompt nativo per la ridenominazione sicura di una cartella esistente.
     * @param {string} folderId - ID della cartella target.
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
            
            if (this.app.notes) this.app.notes.renderNotes(); 
            if (typeof Utils !== 'undefined') Utils.showToast("Cartella rinominata!");
            if (this.app.currentPage === 'mappa' && this.app.graph) this.app.graph.render(); 
        }
    }

    /**
     * Risale l'albero relazionale per generare la sequenza di navigazione (Breadcrumb).
     * @param {string} folderId - ID della cartella bersaglio.
     * @returns {Array<{id: string, name: string}>} L'array del percorso di navigazione partendo dalla root.
     */
    getBreadcrumbPath(folderId) {
        // Ritorno immediato se siamo già nella visualizzazione Root globale
        if (folderId === "root" || !folderId) {
            return [{ id: "root", name: "Tutte le Note" }];
        }

        let path = [];
        let currentId = folderId;

        // Navigazione a ritroso (Bottom-Up) dell'albero delle cartelle
        while (currentId) {
            const folder = this.app.loggedUser.folders.find(f => f.id === currentId);
            if (folder) {
                path.unshift({ id: folder.id, name: folder.name });
                currentId = folder.parentId;
            } else {
                break; // Break loop di sicurezza
            }
        }

        path.unshift({ id: "root", name: "Tutte le Note" });
        return path;
    }

    /**
     * Motore di visualizzazione principale della UI. Sposta l'utente dentro una cartella specifica,
     * aggiorna lo stato visivo globale, inietta il breadcrumb navigabile e lancia il render delle note interne.
     * @param {string} folderId - ID della cartella da visionare ('root' per tutte le note).
     */
    showFolder(folderId) {
        if (this.app.settingsMgr?.revertPreview) {
            this.app.settingsMgr.revertPreview();
        }
        
        this.currentFolderId = folderId;

        // Salvataggio stato UI nel browser per sessioni persistenti
        localStorage.setItem("zenith_lastFolderId", folderId); // Corretto nome chiave standard Zenith
        localStorage.setItem("zenith_lastPage", "mie-note"); 

        // Gestione CSS Navigazione Base
        document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
        document.getElementById("page-mie-note")?.classList.add("active");
        
        document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
        document.querySelector(`[data-page="mie-note"]`)?.classList.add("active");

        this.renderSidebar();

        // ----------------------------------------------------
        // Rendering Breadcrumb Interattivo nella Topbar
        // ----------------------------------------------------
        const path = this.getBreadcrumbPath(folderId);
        const topbarTitle = document.getElementById("topbar-title");
        
        if (topbarTitle) {
            topbarTitle.innerHTML = ""; // Pulizia preventiva
            
            path.forEach((p, index) => {
                const span = document.createElement("span");
                span.className = "breadcrumb-item";
                span.textContent = p.name;
                span.onclick = () => this.showFolder(p.id);
                topbarTitle.appendChild(span);

                // Aggiunge il separatore testuale '/' se non è l'ultimo nodo
                if (index < path.length - 1) {
                    const sep = document.createElement("span");
                    sep.className = "breadcrumb-separator";
                    sep.textContent = "/";
                    topbarTitle.appendChild(sep);
                }
            });
        }

        if (this.app.notes) {
            this.app.notes.renderNotes();
        }
    }

    /**
     * Funzione Core (Ricorsiva) che inietta l'HTML per la costruzione 
     * ad albero della vista laterale (Sidebar), completa di bottoni operativi (Add/Delete/Expand).
     * @param {string|null} [parentId=null] - ID del nodo padre (determina il livello dell'albero).
     * @param {HTMLElement} [container] - L'elemento target dell'HTML.
     * @param {number} [level=0] - Contatore per determinare l'indentazione visiva CSS.
     */
    renderSidebar(parentId = null, container = document.getElementById("sidebarWorkspaces"), level = 0) {
        if (!container || !this.app.loggedUser || !this.app.loggedUser.folders) return;
        
        if (level === 0) container.innerHTML = "";

        const placeholder = document.getElementById("noWorkspacesPlaceholder");
            if (placeholder) {
                placeholder.style.display = (this.app.loggedUser.folders.length === 0) ? "block" : "none";
            }

        // Isola le cartelle appartenenti a questo preciso livello dell'albero
        const folders = this.app.loggedUser.folders.filter(f => f.parentId === parentId);

        folders.forEach(folder => {
            // Controllo per attivare eventuale iconografia "folder pieno" o chevron (tendina)
            const hasChildren = this.app.loggedUser.folders.some(f => f.parentId === folder.id);

            const folderDiv = document.createElement("div");
            folderDiv.className = "workspace-folder";
            if (hasChildren) folderDiv.classList.add("has-children");

            const itemDiv = document.createElement("div");
            itemDiv.className = `workspace-item ${this.currentFolderId === folder.id ? 'active' : ''}`;
            
            // Indentazione matematica per evidenziare la gerarchia padre-figlio
            itemDiv.style.paddingLeft = `${level * 12}px`;

            const icon = level > 0 ? '<span class="sidebar-depth-indicator">↳</span>' : '📁 ';

            // Costruzione HTML della riga cartella (Testo e Container Azioni)
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
            
            // Event Listener primario: Apri la cartella
            itemDiv.onclick = () => this.showFolder(folder.id);

            // Delega Eventi per i tasti secondari (Usa stopPropagation per evitare che il click inneschi l'apertura cartella)
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

            // CHIAMATA RICORSIVA: Se ci sono sottocartelle, la funzione richiama se stessa
            // per costruire il "Ramo Figlio" posizionandolo fisicamente all'interno del nodo corrente (per il sistema a tendina).
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
     * Aggiorna programmaticamente i menù a tendina (<select>) HTML.
     * Viene usato nei form di "Crea Nota" o "Modifica Nota" per mostrare la lista delle cartelle disponibili.
     */
    updateSelects() {
        const selects = [document.getElementById("noteWorkspace"), document.getElementById("modalWorkspace")];
        const folders = this.app.loggedUser?.folders || [];

        // Genera una lista piatta per le tendine tradizionali (permette la selezione di "Nessuna")
        const optionsHtml = `<option value="">Nessuna Cartella (Root)</option>` +
            folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('');

        selects.forEach(select => { 
            if (select) select.innerHTML = optionsHtml; 
        });
    }
}