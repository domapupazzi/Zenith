/**
 * @class SettingsManager
 * @description Gestisce le impostazioni globali dell'applicazione. Controlla i temi visivi (Dark/Light/Ecc.),
 * le dimensioni dinamiche dell'interfaccia (Card, Font, Tabelle) e i toggle di sistema (Auto-Save, Auto-Destroy).
 */
class SettingsManager {
    constructor(app) { 
        this.app = app; 
    }

    /**
     * Carica il tema visivo salvato e applica le impostazioni iniziali senza mostrare notifiche.
     */
    init() {
        if (!this.app.settings) this.app.settings = {};

        if (!this.app.loggedUser) {
            const landingTheme = localStorage.getItem("landingTheme") || "dark";
            document.body.classList.remove('light');
            document.body.classList.add(landingTheme);
            if (typeof Utils !== 'undefined') Utils.fixThemeLegibility();
            return;
        }

        const savedTheme = (this.app.loggedUser && this.app.loggedUser.theme) 
                           ? this.app.loggedUser.theme 
                           : (localStorage.getItem("landingTheme") || "dark");
        
        // 🟢 FIX: Legge i temi dinamicamente dall'HTML ed evita errori
        const allThemes = Array.from(document.querySelectorAll('.theme-option'))
                               .map(el => el.dataset.theme ? el.dataset.theme.trim() : '')
                               .filter(t => t !== '');
                               
        if (allThemes.length > 0) {
            document.body.classList.remove(...allThemes);
        }
        document.body.classList.add(savedTheme);
        if (typeof Utils !== 'undefined') Utils.fixThemeLegibility();

        this.syncSliders();
        this.updatePreviewDOM(false);
        this.apply(true);
        this.initEvents();
    }

    /**
     * Allinea fisicamente le posizioni degli slider e delle checkbox ai valori salvati in memoria.
     */
    syncSliders() {
        if (!this.app.settings) return;
        
        const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; };
        const setCheck = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.checked = val; };
        
        setVal("set-font-size", this.app.settings.fontSize);
        setVal("set-font-family", this.app.settings.fontFamily);
        setVal("set-card-width", this.app.settings.cardWidth);
        setVal("set-card-height", this.app.settings.cardHeight);
        setVal("set-table-width", this.app.settings.tableWidth);
        setVal("set-table-pad-v", this.app.settings.tablePadV);
        setVal("set-table-pad-h", this.app.settings.tablePadH);
        setCheck("exportIncludeDate", this.app.settings.exportIncludeDate ?? true);
        setCheck("exportIncludeTags", this.app.settings.exportIncludeTags ?? true);
        
        setCheck("set-fast-delete", this.app.settings.fastDelete);
        setCheck("set-auto-save", this.app.settings.autoSave);
        setCheck("set-auto-destroy", this.app.settings.autoDestroy);
        //setCheck("set-autocomplete", this.app.settings.enableAutocomplete ?? true);
    }

    initEvents() {
        const inputIds = [
            "set-font-size", "set-font-family", "set-card-width",
            "set-card-height", "set-table-width", "set-table-pad-v", "set-table-pad-h",
            "set-fast-delete", "set-auto-destroy", "set-auto-save",
            "exportIncludeDate", "exportIncludeTags", "set-autocomplete"
        ];

        inputIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const eventType = (el.tagName === "SELECT" || el.type === "checkbox") ? "change" : "input";
                el.addEventListener(eventType, () => {
                    this.updatePreviewDOM(true);
                });
            }
        });

        const applyBtn = document.getElementById("applySettingsBtn");
        if (applyBtn) {
            applyBtn.addEventListener("click", () => {
                this.apply(false);
            });
        }

        // --- GESTIONE TAB ---
        document.querySelectorAll(".settings-nav-item").forEach(btn => {
            btn.addEventListener("click", () => {
                const targetTab = btn.dataset.tab;
                document.querySelectorAll(".settings-nav-item").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                document.querySelectorAll(".settings-tab-panel").forEach(p => p.classList.remove("active"));
                document.getElementById(targetTab)?.classList.add("active");
            });
        });

        document.querySelectorAll(".sub-nav-item").forEach(btn => {
            btn.addEventListener("click", () => {
                const targetSub = btn.dataset.sub;
                document.querySelectorAll(".sub-nav-item").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                document.querySelectorAll(".sub-panel").forEach(p => p.classList.remove("active"));
                document.getElementById(targetSub)?.classList.add("active");
            });
        });
        // --- 🟢 FIX: L'UNICO GESTORE TEMI CORRETTO ---
        // --- GESTIONE TEMI INTERNI ---
        document.querySelectorAll(".theme-option").forEach(opt => {
            opt.addEventListener("click", () => {
                const theme = opt.dataset.theme ? opt.dataset.theme.trim() : null;
                const label = opt.dataset.label || theme;
                
                if (!theme) return; // Sicurezza extra

                const body = document.body;
                
                // Pulisce i temi vecchi
                const allThemes = Array.from(document.querySelectorAll('.theme-option'))
                                       .map(el => el.dataset.theme ? el.dataset.theme.trim() : '')
                                       .filter(t => t !== '');
                
                if (allThemes.length > 0) {
                    body.classList.remove(...allThemes);
                }
                body.classList.add(theme);

                if (typeof Utils !== 'undefined') Utils.fixThemeLegibility();
                
                if (this.app.plans) {
                    this.app.plans.updateUI();
                }

                // 🟢 SALVATAGGIO NELL'ACCOUNT (Ora è DENTRO l'evento click!)
                if (this.app.loggedUser) {
                    this.app.loggedUser.theme = theme;
                    this.app.saveUser(); // Salva e cripta subito
                } else {
                    localStorage.setItem("landingTheme", theme);
                }
                
                document.querySelectorAll(".theme-option").forEach(o => o.classList.remove("active"));
                opt.classList.add("active");
                
                const dropLabel = document.getElementById("dropLabel");
                if (dropLabel) dropLabel.textContent = label;
                if (typeof Utils !== 'undefined') Utils.showToast(`Tema ${label} applicato!`);
            });
        });
    }

    /**
     * Aggiorna in tempo reale la grafica dell'anteprima forzando l'override del CSS.
     */
    updatePreviewDOM(hasChanges = false) {
        if (!this.app.settings) this.app.settings = {};

        const getVal = (id, fallback) => {
            const el = document.getElementById(id);
            return el && el.value ? el.value : fallback;
        };

        const val = {
            fs: getVal("set-font-size", 14),
            ff: getVal("set-font-family", 'system-ui, sans-serif'),
            cw: getVal("set-card-width", 280),
            ch: getVal("set-card-height", 320),
            tw: getVal("set-table-width", 100),
            pv: getVal("set-table-pad-v", 12),
            ph: getVal("set-table-pad-h", 15)
        };

        // 🔴 Abbiamo rimosso il blocco che modificava this.app.settings qui!

        const setLabel = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };
        setLabel("val-font-size", val.fs);
        setLabel("val-card-width", val.cw);
        setLabel("val-card-height", val.ch);
        setLabel("val-table-width", val.tw);
        setLabel("val-table-pad-v", val.pv);
        setLabel("val-table-pad-h", val.ph);

        // 🟢 FIX PREVIEW: Applichiamo le modifiche visive temporanee
        const pText = document.getElementById("preview-text");
        if (pText) {
            pText.style.setProperty('font-size', val.fs + "px", "important");
            pText.style.setProperty('font-family', val.ff, "important");
        }

        const pCard = document.getElementById("preview-card");
        if (pCard) {
            pCard.style.setProperty('width', val.cw + "px", "important");
            pCard.style.setProperty('height', val.ch + "px", "important");
        }

        const pTable = document.getElementById("preview-table");
        if (pTable) {
            pTable.style.setProperty('width', val.tw + "%", "important");
            pTable.querySelectorAll("td, th").forEach(cell => {
                cell.style.setProperty('padding', `${val.pv}px ${val.ph}px`, "important");
            });
        }

        if (hasChanges) {
            const bar = document.getElementById("settings-actions-bar");
            if (bar) bar.classList.add("show");
        }
    }

    /**
     * Applica e salva le impostazioni.
     * @param {boolean} silent - Se true, nasconde il toast di successo (usato all'avvio app).
     */
    apply(silent = false) {
        if (!this.app.settings) this.app.settings = {};

        // 🟢 FIX: Leggiamo i valori dal DOM SOLO al momento della conferma!
        const getVal = (id) => document.getElementById(id)?.value;
        const getCheck = (id) => document.getElementById(id)?.checked;

        this.app.settings = {
            ...this.app.settings, // Mantiene eventuali impostazioni vecchie non presenti in questo form
            fontSize: Number(getVal("set-font-size")) || 14,
            fontFamily: getVal("set-font-family") || 'system-ui, sans-serif',
            cardWidth: Number(getVal("set-card-width")) || 280,
            cardHeight: Number(getVal("set-card-height")) || 320,
            tableWidth: Number(getVal("set-table-width")) || 100,
            tablePadV: Number(getVal("set-table-pad-v")) || 12,
            tablePadH: Number(getVal("set-table-pad-h")) || 15,
            fastDelete: getCheck("set-fast-delete") || false,
            autoSave: getCheck("set-auto-save") || false,
            autoDestroy: getCheck("set-auto-destroy") || false,
            //enableAutocomplete: getCheck("set-autocomplete") ?? true,
            exportIncludeDate: getCheck("exportIncludeDate") ?? true, // Salvataggio opzioni Export
            exportIncludeTags: getCheck("exportIncludeTags") ?? true  // Salvataggio opzioni Export
        };

        const root = document.documentElement;
        
        root.style.setProperty('--user-font-size', `${this.app.settings.fontSize}px`);
        root.style.setProperty('--user-font-family', this.app.settings.fontFamily);
        root.style.setProperty('--user-card-width', `${this.app.settings.cardWidth}px`);
        root.style.setProperty('--user-card-height', `${this.app.settings.cardHeight}px`);
        root.style.setProperty('--table-width', `${this.app.settings.tableWidth}%`);
        root.style.setProperty('--table-pad-v', `${this.app.settings.tablePadV}px`);
        root.style.setProperty('--table-pad-h', `${this.app.settings.tablePadH}px`);

        localStorage.setItem("appSettings", JSON.stringify(this.app.settings));
        
        if (!silent && typeof Utils !== 'undefined') {
            Utils.showToast("Impostazioni salvate con successo! ✨");
        }

        const bar = document.getElementById("settings-actions-bar");
        if (bar) bar.classList.remove("show");
    }

    revertPreview() {
        this.syncSliders();
        this.updatePreviewDOM(false);
        document.getElementById("settings-actions-bar")?.classList.remove("show");
        //if (document.getElementById("set-autocomplete")) document.getElementById("set-autocomplete").checked = this.app.settings.enableAutocomplete;
    }
}