/**
 * @class TagManager
 * @description Gestisce i colori personalizzati, gli stili visivi e il dizionario globale delle etichette (tag).
 * Supporta gerarchie (Padre/Figlio), sinonimi (Alias) e aggiornamenti a cascata su tutte le note.
 */
class TagManager {
    /**
     * Inizializza il gestore dei tag.
     * @param {Object} app - L'istanza principale dell'applicazione (ZenithEngine).
     */
    constructor(app) {
        this.app = app;
        this.tags = {}; 
        this.globalStyle = 'dot'; // Stile visivo di default richiesto
    }

    /**
     * Avvia il manager, carica i salvataggi, applica lo stile e disegna le interfacce.
     */
    init() {
        this.loadSettings();
        this.applyGlobalStyle(this.globalStyle);
        this.initEvents();
        this.renderDictionary();
        this.updatePalette();
        this.renderSidebarTags();
    }

    /**
     * Carica il dizionario dei tag dal LocalStorage.
     * Se non esiste, crea dei dati demo iniziali per mostrare le funzionalità.
     */
    loadSettings() {
        const savedData = localStorage.getItem("appTagManager");
        if (savedData) {
            const parsed = JSON.parse(savedData);
            this.tags = parsed.tags || {};
            this.globalStyle = parsed.globalStyle || 'dot';
        } else {
            this.tags = {
                "urgente": { color: "#ff0044" },
                "lavoro": { color: "#4a56d8" },
                "spesa": { color: "#00ffaa" }
            };
            this.saveSettings();
        }
    }

    /**
     * Salva il dizionario corrente nel LocalStorage e forza l'aggiornamento
     * visivo sia delle note che della sidebar.
     */
    saveSettings() {
        const dataToSave = {
            tags: this.tags,
            globalStyle: this.globalStyle
        };
        localStorage.setItem("appTagManager", JSON.stringify(dataToSave));
        
        // Forza il re-render delle note per applicare i colori o i nuovi nomi all'istante
        if (this.app.notes && typeof this.app.notes.renderNotes === 'function') {
            this.app.notes.renderNotes();
        }
        this.renderSidebarTags();
    }

    /**
     * Applica globalmente lo stile visivo dei tag (es. 'dot', 'pill', 'outline') al body.
     * @param {string} style - L'identificatore dello stile CSS.
     */
    applyGlobalStyle(style) {
        this.globalStyle = style;
        document.body.setAttribute('data-tag-style', style);
    }

    /**
     * Ritorna il colore esadecimale assegnato a un tag.
     * @param {string} tagName - Il nome del tag.
     * @returns {string} Il colore in HEX o la variabile CSS di default se non trovato.
     */
    getColorForTag(tagName) {
        const name = tagName.toLowerCase().trim();
        return this.tags[name] ? this.tags[name].color : "var(--accent)";
    }

    /**
     * Collega gli ascoltatori di eventi per la creazione dei tag e il cambio stile.
     */
    initEvents() {
        // Ascolta i pulsanti dello stile globale
        const styleBtns = document.querySelectorAll(".tag-style-btn");
        styleBtns.forEach(btn => {
            btn.addEventListener("click", (e) => {
                const style = e.target.dataset.style;
                this.applyGlobalStyle(style);
                this.saveSettings();

                styleBtns.forEach(b => {
                    b.classList.remove("active");
                    b.style.background = "var(--bg-card2)";
                    b.style.color = "var(--text-1)";
                });
                
                e.target.classList.add("active");
                e.target.style.background = "var(--accent)";
                e.target.style.color = "#fff";
                
                if (typeof Utils !== 'undefined') Utils.showToast(`Stile Tag cambiato in: ${style} ✨`);
            });
        });

        // Imposta il pulsante di stile attualmente attivo
        const activeBtn = document.querySelector(`.tag-style-btn[data-style="${this.globalStyle}"]`);
        if (activeBtn) {
            document.querySelectorAll(".tag-style-btn").forEach(b => {
                b.classList.remove("active");
                b.style.background = "var(--bg-card2)";
                b.style.color = "var(--text-1)";
            });
            activeBtn.classList.add("active");
            activeBtn.style.background = "var(--accent)";
            activeBtn.style.color = "#fff";
        }

        // Ascolta la creazione manuale di un nuovo tag dalle impostazioni
        const addBtn = document.getElementById("addNewTagBtn");
        if (addBtn) {
            addBtn.addEventListener("click", () => {
                const input = document.getElementById("newTagName");
                const colorInput = document.getElementById("newTagColor");
                
                let tagName = input.value.trim().toLowerCase().replace(/^#/, '');
                
                if (!tagName) {
                    if (typeof Utils !== 'undefined') Utils.showToast("⚠️ Inserisci un nome per il tag!");
                    return;
                }
                
                this.tags[tagName] = { color: colorInput.value };
                this.saveSettings();
                this.renderDictionary();

                if (this.app.gamification && this.app.gamification.canGainDailyXP('tagsCreated', 3)) {
                    this.app.gamification.addXP(20, "Tag Creato");
                    this.app.gamification.unlockBadge("tag_master");
                }
                
                input.value = ""; 
                if (typeof Utils !== 'undefined') Utils.showToast(`Tag #${tagName} creato! 🏷️`);
            });
        }
    }

    /**
     * Registra automaticamente nuovi tag nel dizionario (assegnando colore default) 
     * se l'utente li ha digitati a mano in una nota senza averli creati prima.
     * @param {Array} tagList - Array di nomi di tag.
     */
    registerTags(tagList) {
        if (!tagList || !Array.isArray(tagList)) return;
        
        let hasNew = false;
        tagList.forEach(t => {
            const lowTag = t.toLowerCase().trim();
            if (lowTag && !this.tags[lowTag]) {
                this.tags[lowTag] = { color: "#6c7af0" }; 
                hasNew = true;
            }
        });

        if (hasNew) {
            this.saveSettings();
            this.renderDictionary(); 
        } else {
            this.renderSidebarTags();
        }
    }

    /**
     * Disegna l'interfaccia complessa per la gestione dei tag all'interno delle Impostazioni
     * (colori, rinomina, gerarchie, sinonimi e conteggio).
     */
    renderDictionary() {
        const container = document.getElementById("tagDictionaryList");
        if (!container) return;

        container.innerHTML = "";
        const tagNames = Object.keys(this.tags);

        // Conta quante note attive usano ogni tag
        const tagCounts = {};
        if (this.app.loggedUser && this.app.loggedUser.notes) {
            this.app.loggedUser.notes.forEach(n => {
                if (n.status !== 'trashed' && n.tags) {
                    n.tags.forEach(t => {
                        const lowT = t.toLowerCase().trim();
                        tagCounts[lowT] = (tagCounts[lowT] || 0) + 1;
                    });
                }
            });
        }

        if (tagNames.length === 0) {
            container.innerHTML = `<div style="text-align: center; color: var(--text-3); font-size: 13px; padding: 20px;">Nessun tag registrato.</div>`;
            return;
        }

        tagNames.forEach(tagName => {
            const color = this.tags[tagName].color;
            const count = tagCounts[tagName] || 0; 
            const tagData = this.tags[tagName];
            const parent = tagData.parent || null;
            const aliases = tagData.aliases ? tagData.aliases.join(', ') : "";
            
            const div = document.createElement("div");
            div.className = "tag-dict-item";
            
            let parentOptions = `<option value="">-- Nessun Padre --</option>`;
            tagNames.forEach(t => {
                if (t !== tagName) {
                    // Previene la selezione se creerebbe un Loop Infinito nella gerarchia
                    if (!this.isDescendant(tagName, t)) {
                        const isSelected = t === parent ? "selected" : "";
                        parentOptions += `<option value="${t}" ${isSelected}>Sotto: #${t}</option>`;
                    }
                }
            });

            div.innerHTML = `
                <div style="flex: 1; display: flex; flex-direction: column; gap: 12px; padding-right: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-weight: bold; color: var(--text-1); font-size: 18px;">#</span>
                        <input type="text" class="tag-rename-input" data-old="${tagName}" value="${tagName}" 
                               style="background: transparent; border: 1px solid transparent; border-radius: 4px; color: var(--text-1); font-weight: bold; font-size: 15px; outline: none; flex: 1; padding: 2px 5px; transition: all 0.2s;"
                               onfocus="this.style.borderColor='var(--accent)'; this.style.background='var(--bg-card)';" 
                               onblur="this.style.borderColor='transparent'; this.style.background='transparent';"
                               title="Clicca per rinominare">
                        <div style="font-size: 11px; color: var(--text-3); white-space: nowrap;">${count} note collegate</div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-left: 20px;">
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <label style="font-size: 10px; color: var(--text-3); text-transform: uppercase; font-weight: bold;">Genitore</label>
                            <select class="tag-parent-select" data-tag="${tagName}" 
                                    style="font-size: 12px; padding: 6px; background: var(--bg-card); color: var(--text-1); border: 1px solid var(--border); border-radius: 6px; width: 100%; cursor: pointer; outline: none;">
                                ${parentOptions}
                            </select>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <label style="font-size: 10px; color: var(--text-3); text-transform: uppercase; font-weight: bold;">Sinonimi (Alias)</label>
                            <input type="text" class="tag-aliases-input" data-tag="${tagName}" value="${aliases}" 
                                   placeholder="es: js, code, frontend" 
                                   style="font-size: 12px; padding: 6px; background: var(--bg-card); border: 1px solid var(--border); color: var(--text-1); border-radius: 6px; width: 100%; outline: none;">
                        </div>
                    </div>
                </div>
                
                <div style="display: flex; align-items: center; gap: 12px; border-left: 1px solid var(--border); padding-left: 15px;">
                    <input type="color" list="tagColorPalette" class="tag-color-picker" data-tag="${tagName}" value="${color}" title="Cambia colore">
                    <button class="icon-btn-small delete-tag-btn" data-tag="${tagName}" style="color: var(--badge-err-t); border: none; background: transparent; font-size: 18px; cursor: pointer;" title="Elimina tag">🗑️</button>
                </div>
            `;
            container.appendChild(div);
        });

        this.attachDictionaryEvents(container);
    }
    
    /**
     * Calcola i 5 tag più utilizzati e li posiziona in cima nella Sidebar per l'accesso rapido.
     */
    renderSidebarTags() {
        const sidebarContainer = document.getElementById("sidebarSmartTags");
        const placeholder = document.getElementById("noTagsPlaceholder");
        if (!sidebarContainer) return;

        const counts = {};
        if (this.app.loggedUser && this.app.loggedUser.notes) {
            this.app.loggedUser.notes.forEach(n => {
                if (n.status === 'active' && n.tags) {
                    n.tags.forEach(t => {
                        const lowT = t.toLowerCase().trim();
                        counts[lowT] = (counts[lowT] || 0) + 1;
                    });
                }
            });
        }

        const tagNames = Object.keys(counts);

        if (tagNames.length === 0) {
            if (placeholder) placeholder.style.display = "block";
            sidebarContainer.querySelectorAll('.nav-item-smart').forEach(l => l.remove());
            return;
        }

        if (placeholder) placeholder.style.display = "none";

        const topTags = tagNames.sort((a, b) => counts[b] - counts[a]).slice(0, 5);

        sidebarContainer.querySelectorAll('.nav-item-smart').forEach(l => l.remove());

        topTags.forEach(tagName => {
            const color = this.getColorForTag(tagName);
            
            const btn = document.createElement("button");
            btn.className = "nav-item nav-item-smart";
            btn.dataset.page = "mie-note";
            btn.style.fontSize = "13px";
            btn.style.padding = "8px 12px";
            btn.innerHTML = `
                <span style="color: ${color}; font-size: 10px;">●</span> 
                <span style="flex: 1;">${tagName}</span>
                <span style="font-size: 10px; opacity: 0.6;">${counts[tagName]}</span>
            `;
            
            btn.onclick = () => {
                if (this.app.notes) {
                    this.app.notes.triggerTagSearch(tagName);
                }
            };

            sidebarContainer.appendChild(btn);
        });
    }

    /**
     * Ritorna un array contenente il tag specificato e tutti i suoi discendenti.
     * @param {string} tagName - Il tag di partenza.
     * @returns {Array<string>} Array dei tag familiari.
     */
    getFamily(tagName) {
        let family = [tagName.toLowerCase()];
        for (const [name, data] of Object.entries(this.tags)) {
            if (data.parent && data.parent.toLowerCase() === tagName.toLowerCase()) {
                family = family.concat(this.getFamily(name));
            }
        }
        return family;
    }

    /**
     * Verifica se un tag è un discendente gerarchico di un altro tag per prevenire i loop.
     * @param {string} parentTagName - Il presunto tag genitore.
     * @param {string} childTagName - Il tag figlio da controllare.
     * @returns {boolean} True se è discendente, False se non lo è.
     */
    isDescendant(parentTagName, childTagName) {
        const childData = this.tags[childTagName];
        if (!childData || !childData.parent) return false;
        if (childData.parent.toLowerCase() === parentTagName.toLowerCase()) return true;
        return this.isDescendant(parentTagName, childData.parent);
    }

    /**
     * Popola la palette dei colori predefinita (i colori dei temi) all'interno degli input color.
     */
    updatePalette() {
        const palette = document.getElementById("tagColorPalette");
        if (!palette) return;

        const themeAccents = [
            "#6c7af0", "#4a56d8", "#4d9cf0", "#ff007f", "#8b9c73", 
            "#fcd581", "#f06449", "#cba6f7", "#9c27b0", "#00dcff",
            "#b58900", "#ffb300", "#00e676", "#e91e63", "#00ff00"
        ];

        palette.innerHTML = themeAccents.map(color => `<option value="${color}">`).join("");
    }

    /**
     * Delega tutti gli ascoltatori agli input dinamici del dizionario 
     * (Cambio genitore, rinomina, alias, colore, eliminazione).
     * @param {HTMLElement} container - L'elemento wrapper del dizionario.
     */
    attachDictionaryEvents(container) {
        
        // Cambio Gerarchia (Padre)
        container.querySelectorAll(".tag-parent-select").forEach(sel => {
            sel.addEventListener("change", (e) => {
                const tag = e.currentTarget.dataset.tag;
                if (!this.tags[tag]) return;
                this.tags[tag].parent = e.currentTarget.value || null;
                
                this.saveSettings();
                this.renderDictionary(); 
                
                if (typeof Utils !== 'undefined') Utils.showToast(`Gerarchia aggiornata per #${tag} 🌳`);
            });
        });

        // Modifica Sinonimi (Alias)
        container.querySelectorAll(".tag-aliases-input").forEach(inp => {
            inp.addEventListener("change", (e) => {
                const tag = e.currentTarget.dataset.tag;
                if (!this.tags[tag]) return;
                
                const aliasArray = e.currentTarget.value.split(',')
                    .map(s => s.trim().toLowerCase().replace(/^#/, ''))
                    .filter(s => s);
                    
                this.tags[tag].aliases = aliasArray;
                this.saveSettings();
                if (typeof Utils !== 'undefined') Utils.showToast(`Sinonimi aggiornati per #${tag} 🔗`);
            });
        });
        
        // Modifica Colore
        container.querySelectorAll(".tag-color-picker").forEach(picker => {
            picker.addEventListener("input", (e) => {
                const tag = e.target.dataset.tag;
                this.tags[tag].color = e.target.value;
                this.saveSettings();
            });
            picker.addEventListener("change", (e) => {
                const tag = e.target.dataset.tag;
                if (typeof Utils !== 'undefined') Utils.showToast(`Colore aggiornato per #${tag} 🎨`);
            });
        });
        
        // Rinominazione del Tag
        container.querySelectorAll(".tag-rename-input").forEach(input => {
            input.addEventListener("change", (e) => {
                const oldTag = e.currentTarget.dataset.old;
                let newTag = e.currentTarget.value.trim().toLowerCase().replace(/^#/, '');

                if (!newTag || newTag === oldTag) {
                    e.currentTarget.value = oldTag;
                    return;
                }

                if (this.tags[newTag]) {
                    if (typeof Utils !== 'undefined') Utils.showToast(`⚠️ Il tag #${newTag} esiste già!`);
                    e.currentTarget.value = oldTag;
                    return;
                }

                // Sposta i dati sulla nuova chiave
                this.tags[newTag] = this.tags[oldTag];
                delete this.tags[oldTag];

                // Aggiorna fisicamente il tag in tutte le note dell'utente
                let notesUpdated = false;
                if (this.app.loggedUser && this.app.loggedUser.notes) {
                    this.app.loggedUser.notes.forEach(note => {
                        if (note.tags && note.tags.includes(oldTag)) {
                            note.tags = note.tags.map(t => t === oldTag ? newTag : t);
                            notesUpdated = true;
                        }
                    });
                    
                    if (notesUpdated) this.app.saveUser();
                }

                this.saveSettings();
                this.renderDictionary();
                
                if (typeof Utils !== 'undefined') Utils.showToast(`Tag rinominato: #${oldTag} ➔ #${newTag} ✨`);
            });
        });

        // Eliminazione Globale del Tag
        container.querySelectorAll(".delete-tag-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const tagToDelete = e.currentTarget.dataset.tag;
                
                delete this.tags[tagToDelete];

                if (this.app.loggedUser && this.app.loggedUser.notes) {
                    let notesUpdated = false;
                    
                    this.app.loggedUser.notes.forEach(note => {
                        if (note.tags && note.tags.includes(tagToDelete)) {
                            note.tags = note.tags.filter(t => t !== tagToDelete);
                            notesUpdated = true;
                        }
                    });

                    if (notesUpdated) this.app.saveUser();
                }

                this.saveSettings();
                this.renderDictionary();
                
                if (typeof Utils !== 'undefined') Utils.showToast(`Tag #${tagToDelete} eliminato ovunque! 🗑️`);
            });
        });
    }

    /**
     * Controlla un array di tag e converte eventuali sinonimi (alias) inseriti dall'utente 
     * nel rispettivo Tag Ufficiale (Padre).
     * @param {Array<string>} tagList - Lista mista di tag e/o sinonimi inseriti.
     * @returns {Array<string>} Lista di tag ufficiali normalizzati.
     */
    resolveAliases(tagList) {
        if (!tagList || !Array.isArray(tagList)) return [];
        
        return tagList.map(t => {
            const lowTag = t.toLowerCase().trim();
            for (const [mainTag, data] of Object.entries(this.tags)) {
                if (data.aliases && data.aliases.includes(lowTag)) {
                    return mainTag; 
                }
            }
            return lowTag; 
        });
    }
}