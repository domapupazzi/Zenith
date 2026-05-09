/**
 * @class TagManager
 * @description Gestisce i colori personalizzati, gli stili visivi e il dizionario globale delle etichette (tag).
 */
class TagManager {
    constructor(app) {
        this.app = app;
        // Struttura Dati Base
        this.tags = {}; 
        this.globalStyle = 'dot'; // Default richiesto
    }

    init() {
        this.loadSettings();
        this.applyGlobalStyle(this.globalStyle);
        this.initEvents();
        this.renderDictionary();
        this.updatePalette();
        this.renderSidebarTags()
    }

    loadSettings() {
        const savedData = localStorage.getItem("appTagManager");
        if (savedData) {
            const parsed = JSON.parse(savedData);
            this.tags = parsed.tags || {};
            this.globalStyle = parsed.globalStyle || 'dot';
        } else {
            // Dati demo iniziali per far vedere come funziona
            this.tags = {
                "urgente": { color: "#ff0044" },
                "lavoro": { color: "#4a56d8" },
                "spesa": { color: "#00ffaa" }
            };
            this.saveSettings();
        }
    }

    saveSettings() {
        const dataToSave = {
            tags: this.tags,
            globalStyle: this.globalStyle
        };
        localStorage.setItem("appTagManager", JSON.stringify(dataToSave));
        
        // Se c'è NotesManager, forza il re-render delle note per applicare i colori subito!
        if (this.app.notes && typeof this.app.notes.renderNotes === 'function') {
            this.app.notes.renderNotes();
        }
        this.renderSidebarTags()
    }

    applyGlobalStyle(style) {
        this.globalStyle = style;
        document.body.setAttribute('data-tag-style', style);
    }

    /**
     * Ritorna il colore esadecimale di un tag, o l'accento di default se non esiste.
     */
    getColorForTag(tagName) {
        const name = tagName.toLowerCase().trim();
        return this.tags[name] ? this.tags[name].color : "var(--accent)";
    }

    initEvents() {
        // --- 1. Ascolta i pulsanti dello stile globale ---
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

        // --- 2. 🟢 NUOVO: Ascolta la Creazione di un Nuovo Tag ---
        const addBtn = document.getElementById("addNewTagBtn");
        if (addBtn) {
            addBtn.addEventListener("click", () => {
                const input = document.getElementById("newTagName");
                const colorInput = document.getElementById("newTagColor");
                
                // Pulizia del nome (rimuove spazi e # iniziali)
                let tagName = input.value.trim().toLowerCase().replace(/^#/, '');
                
                if (!tagName) {
                    if (typeof Utils !== 'undefined') Utils.showToast("⚠️ Inserisci un nome per il tag!");
                    return;
                }
                
                // Salva il nuovo tag nel dizionario
                this.tags[tagName] = { color: colorInput.value };
                this.saveSettings();
                this.renderDictionary();

                if (this.app.gamification && this.app.gamification.canGainDailyXP('tagsCreated', 3)) {
                    this.app.gamification.addXP(20, "Tag Creato");
                    this.app.gamification.unlockBadge("tag_master");
                }
                
                input.value = ""; // Svuota l'input
                if (typeof Utils !== 'undefined') Utils.showToast(`Tag #${tagName} creato! 🏷️`);
            });
        }
    }

    /**
     * Registra automaticamente nuovi tag nel dizionario se non esistono ancora.
     * @param {Array} tagList - Lista di stringhe (tag) da controllare.
     */
    registerTags(tagList) {
        if (!tagList || !Array.isArray(tagList)) return;
        
        let hasNew = false;
        tagList.forEach(t => {
            const lowTag = t.toLowerCase().trim();
            if (lowTag && !this.tags[lowTag]) {
                // Se il tag è nuovo, lo aggiungiamo con il colore di default
                this.tags[lowTag] = { color: "#6c7af0" }; // O il tuo --accent
                hasNew = true;
            }
        });

        if (hasNew) {
            this.saveSettings();
            this.renderDictionary(); // Aggiorna la lista nelle impostazioni se aperta
        } else {
            this.renderSidebarTags();
        }
    }

    renderDictionary() {
        const container = document.getElementById("tagDictionaryList");
        if (!container) return;

        container.innerHTML = "";
        const tagNames = Object.keys(this.tags);

        // 🟢 CALCOLO RIFERIMENTI: Conta quante note usano ogni tag
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
            const count = tagCounts[tagName] || 0; // Prende il numero di note
            const tagData = this.tags[tagName];
            const parent = tagData.parent || null;
            const aliases = tagData.aliases ? tagData.aliases.join(', ') : "";
            
            const div = document.createElement("div");
            div.className = "tag-dict-item";
            // Sostituisci il blocco div.innerHTML dentro renderDictionary() con questo:
            // Cerca il punto dove generi parentOptions e aggiungi il controllo:
            let parentOptions = `<option value="">-- Nessun Padre --</option>`;
            tagNames.forEach(t => {
                if (t !== tagName) {
                    // 🟢 Se tagName è un antenato di t, non permettere a t di diventare padre di tagName
                    if (!this.isDescendant(tagName, t)) {
                        const isSelected = t === parent ? "selected" : "";
                        parentOptions += `<option value="${t}" ${isSelected}>Sotto: #${t}</option>`;
                    }
                }
            });

            // 🟢 UI MIGLIORATA: Layout a griglia per Gerarchia e Sinonimi
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

        // Riaggancia gli eventi (color picker e delete) come fatto in precedenza...
        this.attachDictionaryEvents(container);
    }
    
    /**
     * Calcola i tag più usati e popola la sezione dedicata nella Sidebar.
     */
    renderSidebarTags() {
        const sidebarContainer = document.getElementById("sidebarSmartTags");
        const placeholder = document.getElementById("noTagsPlaceholder");
        if (!sidebarContainer) return;

        // 1. Contiamo le occorrenze di ogni tag (solo note attive)
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

        // 2. Gestione Placeholder
        if (tagNames.length === 0) {
            if (placeholder) placeholder.style.display = "block";
            // Rimuove eventuali vecchi link ai tag
            const oldLinks = sidebarContainer.querySelectorAll('.nav-item-smart');
            oldLinks.forEach(l => l.remove());
            return;
        }

        if (placeholder) placeholder.style.display = "none";

        // 3. Prendiamo i Top 5 tag per frequenza
        const topTags = tagNames
            .sort((a, b) => counts[b] - counts[a])
            .slice(0, 5);

        // 4. Rendering fisico degli item nella Sidebar
        // Puliamo i vecchi tag (senza toccare il placeholder)
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
            
            // Cliccando il tag nella sidebar, usiamo la ricerca del NotesManager
            btn.onclick = () => {
                if (this.app.notes) {
                    this.app.notes.triggerTagSearch(tagName);
                }
            };

            sidebarContainer.appendChild(btn);
        });
    }
    /**
     * Ritorna un array con il nome del tag stesso e tutti i suoi discendenti (figli, nipoti, ecc.)
     */
    /** 🟢 Ritorna il tag e tutti i suoi figli/nipoti ricorsivamente */
    getFamily(tagName) {
        let family = [tagName.toLowerCase()];
        for (const [name, data] of Object.entries(this.tags)) {
            if (data.parent && data.parent.toLowerCase() === tagName.toLowerCase()) {
                family = family.concat(this.getFamily(name));
            }
        }
        return family;
    }

    /** 🟢 Verifica se un tag è un discendente di un altro (per prevenire loop) */
    isDescendant(parentTagName, childTagName) {
        const childData = this.tags[childTagName];
        if (!childData || !childData.parent) return false;
        if (childData.parent.toLowerCase() === parentTagName.toLowerCase()) return true;
        return this.isDescendant(parentTagName, childData.parent);
    }

    // Ricordati di chiamare this.renderSidebarTags() dentro saveSettings() 
    // e alla fine di init() per avere la sidebar sempre aggiornata.
    updatePalette() {
        const palette = document.getElementById("tagColorPalette");
        if (!palette) return;

        // I colori "Core" dei tuoi 15 temi
        const themeAccents = [
            "#6c7af0", "#4a56d8", "#4d9cf0", "#ff007f", "#8b9c73", 
            "#fcd581", "#f06449", "#cba6f7", "#9c27b0", "#00dcff",
            "#b58900", "#ffb300", "#00e676", "#e91e63", "#00ff00"
        ];

        palette.innerHTML = themeAccents
            .map(color => `<option value="${color}">`)
            .join("");
    }
    /** Gestisce i cambi di colore e l'eliminazione dei tag dal dizionario */
    /** Gestisce i cambi di colore e l'eliminazione dei tag dal dizionario */
    attachDictionaryEvents(container) {
        container.querySelectorAll(".tag-parent-select").forEach(sel => {
            sel.addEventListener("change", (e) => {
                const tag = e.currentTarget.dataset.tag;
                if (!this.tags[tag]) return;
                this.tags[tag].parent = e.currentTarget.value || null;
                
                this.saveSettings();
                // 🟢 FIX: Ricarica il dizionario per aggiornare le "opzioni vietate" negli altri tag
                this.renderDictionary(); 
                
                if (typeof Utils !== 'undefined') Utils.showToast(`Gerarchia aggiornata per #${tag} 🌳`);
            });
        });

        container.querySelectorAll(".tag-aliases-input").forEach(inp => {
            inp.addEventListener("change", (e) => {
                const tag = e.currentTarget.dataset.tag;
                if (!this.tags[tag]) return;
                // Pulisce e formatta la stringa in un array
                const aliasArray = e.currentTarget.value.split(',').map(s => s.trim().toLowerCase().replace(/^#/, '')).filter(s => s);
                this.tags[tag].aliases = aliasArray;
                this.saveSettings();
                if (typeof Utils !== 'undefined') Utils.showToast(`Sinonimi aggiornati per #${tag} 🔗`);
            });
        });
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
        // 1. 🟢 NUOVO: Ascolta la Rinominazione del Tag
        container.querySelectorAll(".tag-rename-input").forEach(input => {
            input.addEventListener("change", (e) => {
                const oldTag = e.currentTarget.dataset.old;
                let newTag = e.currentTarget.value.trim().toLowerCase().replace(/^#/, '');

                // Se svuota il campo o non cambia nulla, ripristina il vecchio nome
                if (!newTag || newTag === oldTag) {
                    e.currentTarget.value = oldTag;
                    return;
                }

                // Prevenzione: se il nuovo nome esiste già, blocca per evitare sovrascritture accidentali
                if (this.tags[newTag]) {
                    if (typeof Utils !== 'undefined') Utils.showToast(`⚠️ Il tag #${newTag} esiste già!`);
                    e.currentTarget.value = oldTag;
                    return;
                }

                // A. Aggiorna il dizionario (Crea il nuovo, copia i dati, elimina il vecchio)
                this.tags[newTag] = this.tags[oldTag];
                delete this.tags[oldTag];

                // B. Aggiorna TUTTE le note a cascata
                let notesUpdated = false;
                if (this.app.loggedUser && this.app.loggedUser.notes) {
                    this.app.loggedUser.notes.forEach(note => {
                        if (note.tags && note.tags.includes(oldTag)) {
                            // Sostituisce il vecchio tag con il nuovo nell'array della nota
                            note.tags = note.tags.map(t => t === oldTag ? newTag : t);
                            notesUpdated = true;
                        }
                    });
                    
                    // Salva le modifiche al database principale
                    if (notesUpdated) {
                        this.app.saveUser();
                    }
                }

                // C. Salva le impostazioni (aggiorna sidebar e griglia note automaticamente)
                this.saveSettings();
                this.renderDictionary();
                
                if (typeof Utils !== 'undefined') Utils.showToast(`Tag rinominato: #${oldTag} ➔ #${newTag} ✨`);
            });
        });

        // 🟢 FIX BUG: Eliminazione Globale del Tag (Dizionario + Note + Sidebar)
        container.querySelectorAll(".delete-tag-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const tagToDelete = e.currentTarget.dataset.tag;
                
                // 1. Rimuove il tag dal dizionario impostazioni
                delete this.tags[tagToDelete];

                // 2. Scorre TUTTE le note e rimuove fisicamente la parola dal loro array
                if (this.app.loggedUser && this.app.loggedUser.notes) {
                    let notesUpdated = false;
                    
                    this.app.loggedUser.notes.forEach(note => {
                        if (note.tags && note.tags.includes(tagToDelete)) {
                            // Filtra via il tag eliminato
                            note.tags = note.tags.filter(t => t !== tagToDelete);
                            notesUpdated = true;
                        }
                    });

                    // Se abbiamo ripulito delle note, salviamo il database principale
                    if (notesUpdated) {
                        this.app.saveUser();
                    }
                }

                // 3. Salva le impostazioni (questo ridisegna le note e aggiorna la Sidebar da zero!)
                this.saveSettings();
                this.renderDictionary();
                
                if (typeof Utils !== 'undefined') Utils.showToast(`Tag #${tagToDelete} eliminato ovunque! 🗑️`);
            });
        });
    }
    /**
     * 🟢 NUOVO MOTORE SINONIMI: Converte gli alias nei tag ufficiali.
     */
    resolveAliases(tagList) {
        if (!tagList || !Array.isArray(tagList)) return [];
        
        return tagList.map(t => {
            const lowTag = t.toLowerCase().trim();
            // Cerca nel dizionario se questo tag è un sinonimo di qualche tag ufficiale
            for (const [mainTag, data] of Object.entries(this.tags)) {
                if (data.aliases && data.aliases.includes(lowTag)) {
                    return mainTag; // Trovato! Sostituisci con il tag Padre
                }
            }
            return lowTag; // Se non è un sinonimo, lo lascia così com'è
        });
    }
}