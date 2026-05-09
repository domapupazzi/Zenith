/**
 * @class ZenithEngine
 * @description Il "Direttore d'Orchestra" dell'applicazione. Inizializza tutti i manager secondari,
 * gestisce lo stato globale (utente loggato, impostazioni), il routing delle pagine e la persistenza dei dati.
 */
class ZenithEngine {
    /**
     * Costruttore dell'app. Recupera i dati salvati dal LocalStorage, carica i settings di default
     * e istanzia tutti i Manager (Auth, Settings, FileSystem, Calendar, Notes, Graph).
     */
    constructor() {
        this.users = JSON.parse(localStorage.getItem("users")) || [];

        // Ordine di importanza per il login:
        // 1. Sessione volatile (Refresh) 2. Sessione lunga (Rimani collegato) 3. Vecchio salvataggio (Legacy)
        let user = JSON.parse(sessionStorage.getItem("zenith_volatile_user"));

        if (!user) {
            const longSession = JSON.parse(localStorage.getItem("zenith_session"));
            if (longSession && Date.now() < longSession.expiresAt) {
                user = this.users.find(u => u.id === longSession.userId);
            }
        }

        // Salvataggio di emergenza se gli altri falliscono
        if (!user) {
            user = JSON.parse(localStorage.getItem("loggedUser"));
        }

        this.loggedUser = user;
        
        // Gestione di sicurezza per note criptate in RAM
        if (this.loggedUser && typeof this.loggedUser.notes === 'string') {
            const ramKey = sessionStorage.getItem("zenith_master_key");

            if (ramKey) {
                this.unlockVault(ramKey);
            } else {
                // Sicurezza estrema: svuota i dati temporaneamente se manca la chiave in RAM
                this.lockedNotesData = this.loggedUser.notes;
                this.loggedUser.notes = [];
                this.loggedUser.folders = [];
            }
        }
        
        this.isStarted = false;
        this.graph = new GraphManager(this);
        this.tagManager = new TagManager(this);
        this.tagManager.init();
        this.gamification = new GamificationManager(this);
        this.plans = new PlanManager(this);
        this.exportManager = new ExportManager(this);
        this.masterKey = null; // La chiave vive solo in RAM

        const defaultSettings = {
            fontSize: 14, fontFamily: "system-ui, sans-serif", cardWidth: 280, cardHeight: 320,
            fastDelete: false, autoDestroy: false, autoSave: false,
            viewMode: 'grid', tablePadV: 12, tablePadH: 15, tableWidth: 100
        };

        const savedSettings = JSON.parse(localStorage.getItem("appSettings"));
        this.settings = savedSettings ? { ...defaultSettings, ...savedSettings } : defaultSettings;

        this.auth = new AuthManager(this);
        this.settingsMgr = new SettingsManager(this);
        this.fileSystem = new FileSystemManager(this);
        this.calendar = new CalendarManager(this);
        this.notes = new NotesManager(this);

        this.timerInterval = null;
        
        // Gestione Sidebar a comparsa per dispositivi Mobile
        const menuBtn = document.getElementById("mobile-menu-btn");
        const overlay = document.getElementById("mobile-overlay");
        
        if (menuBtn && overlay) {
            menuBtn.addEventListener("click", () => document.body.classList.add("sidebar-open"));
            overlay.addEventListener("click", () => document.body.classList.remove("sidebar-open"));
        }
        
        this.init();
    }

    /**
     * Inizializza l'interfaccia utente. Accende il loader, avvia tutti i moduli registrati,
     * e collega gli ascoltatori di eventi globali (Export/Import JSON, Reset, Logout, Tabs del Profilo).
     */
    init() {
        document.getElementById("loader")?.classList.add("visible");

        // Inizializzazione dinamica dei Moduli
        const startModule = (module, name) => {
            if (module) {
                try {
                    if (typeof module.init === 'function') module.init();
                    if (typeof module.initEvents === 'function') module.initEvents(); 
                } catch (e) { 
                    console.warn(`Errore modulo ${name}`, e); 
                }
            }
        };

        startModule(this.settingsMgr, "Settings");
        startModule(this.auth, "Auth");
        startModule(this.notes, "Notes");
        startModule(this.fileSystem, "FileSystem");
        startModule(this.calendar, "Calendar");
        startModule(this.exportManager, "ExportManager");

        // --- GESTIONE DATI E ACCOUNT ---
        document.getElementById("exportAllBtn")?.addEventListener("click", () => {
            if (!this.loggedUser) return;
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.loggedUser));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", `Zenith_Backup_${this.loggedUser.nome}.json`);
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        });

        document.getElementById("importBackupFile")?.addEventListener("change", (e) => {
            const file = e.target.files[0]; 
            if (!file) return; 
            
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const importedData = JSON.parse(event.target.result);
                    if (importedData.nome && importedData.notes) {
                        this.loggedUser = importedData;
                        const users = JSON.parse(localStorage.getItem("users")) || [];
                        const idx = users.findIndex(u => u.id === this.loggedUser.id);
                        
                        if (idx !== -1) users[idx] = this.loggedUser; 
                        else users.push(this.loggedUser);
                        
                        localStorage.setItem("users", JSON.stringify(users));
                        localStorage.setItem("loggedUser", JSON.stringify(this.loggedUser));
                        alert("✅ Backup importato con successo! L'app si riavvierà per applicare i dati.");
                        location.reload();
                    } else { 
                        alert("❌ File di backup non valido o corrotto."); 
                    }
                } catch (err) { 
                    alert("❌ Errore nella lettura del file."); 
                }
            };
            reader.readAsText(file);
        });

        document.getElementById("settingsResetBtn")?.addEventListener("click", () => {
            const sicuro = confirm("⚠️ ATTENZIONE: Vuoi davvero cancellare TUTTO il tuo account e le tue note?\nQuesta azione è IRREVERSIBILE!");
            if (sicuro) {
                const users = JSON.parse(localStorage.getItem("users")) || [];
                const remainingUsers = users.filter(u => u.id !== this.loggedUser.id);
                localStorage.setItem("users", JSON.stringify(remainingUsers));
                localStorage.removeItem("loggedUser");
                localStorage.clear();
                location.reload();
            }
        });

        document.getElementById("settingsLogoutBtn")?.addEventListener("click", () => {
            const allThemes = Array.from(document.querySelectorAll('.theme-option'))
                .map(el => el.dataset.theme ? el.dataset.theme.trim() : '')
                .filter(t => t !== '');
                
            document.body.classList.remove('light', ...allThemes);
            document.body.classList.add('dark'); 
            localStorage.removeItem("zenith_session");
            localStorage.removeItem("loggedUser");
            sessionStorage.removeItem("zenith_volatile_user");
            location.reload();
        });

        // --- GESTIONE TABS PROFILO ---
        const switchProfileTab = (btnId, panelId) => {
            document.querySelectorAll('.profile-tab').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.profile-tab-panel').forEach(panel => panel.classList.add('hidden'));

            document.getElementById(btnId).classList.add('active');
            document.getElementById(panelId).classList.remove('hidden');
        };

        document.getElementById("tabStatsBtn")?.addEventListener("click", () => switchProfileTab('tabStatsBtn', 'profile-tab-stats'));
        document.getElementById("tabGoalsBtn")?.addEventListener("click", () => {
            switchProfileTab('tabGoalsBtn', 'profile-tab-goals');
            this.gamification.updateUI(); 
        });
        document.getElementById("tabAccountBtn")?.addEventListener("click", () => switchProfileTab('tabAccountBtn', 'profile-tab-account'));

        // --- NAVIGAZIONE GLOBALE E MODALI ---
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', (e) => this.navigate(e.currentTarget.dataset.page));
        });
        document.getElementById("profileBtn")?.addEventListener("click", () => this.navigate('profilo'));
        document.getElementById("settingsBtn")?.addEventListener("click", () => this.navigate('settings'));

        document.getElementById("closeFullChartBtn")?.addEventListener("click", () => document.getElementById("fullChartModal").classList.add("hidden"));
        document.getElementById("closeCelebrationBtn")?.addEventListener("click", () => this.gamification.closeCurrentCelebration());
        document.getElementById("gamificationHelpBtn")?.addEventListener("click", () => document.getElementById("gamificationHelpModal").classList.remove("hidden"));
        document.getElementById("closeGamiHelpBtn")?.addEventListener("click", () => document.getElementById("gamificationHelpModal").classList.add("hidden"));
        document.getElementById("alertConfirmBtn")?.addEventListener("click", () => document.getElementById("alertModal").classList.add("hidden"));

        // Gestione Cambio Vista (Griglia, Tabella, Kanban)
        const viewSelect = document.getElementById('viewModeSelect');
        if (viewSelect) {
            viewSelect.value = this.settings.viewMode || 'grid';
            viewSelect.addEventListener('change', (e) => {
                this.settings.viewMode = e.target.value;
                localStorage.setItem("appSettings", JSON.stringify(this.settings));
                if (this.notes) this.notes.renderNotes();
            });
        }

        // Avvio Ritardato per consentire il setup del DOM
        setTimeout(() => {
            this.checkLoginState();
        }, 50);
    }

    /**
     * Gestisce il routing interno dell'applicazione (Single Page Application).
     * Nasconde le pagine non attive, mostra quella richiesta e salva lo stato.
     * @param {string} pageId - L'ID della pagina da mostrare.
     */
    navigate(pageId) {
        if (pageId !== 'settings') { 
            this.settingsMgr.revertPreview(); 
        }
        
        if (pageId === 'mappa' && !this.plans.checkFeature('graph')) {
            return;
        }

        localStorage.setItem("zenith_lastPage", pageId);
        this.currentPage = pageId;

        document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
        document.getElementById("page-" + pageId)?.classList.add("active");

        document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
        document.querySelector(`[data-page="${pageId}"]`)?.classList.add("active");

        const titles = {
            "dashboard": "Dashboard", "mie-note": "Tutte le Note",
            "calendario": "Calendario", "cestino": "Cestino",
            "profilo": "Profilo Utente", "settings": "Impostazioni",
            "mappa": "Mappa Relazionale"
        };
        
        document.getElementById("topbar-title").textContent = titles[pageId] || "Zenith";

        if (pageId === 'mie-note') {
            this.fileSystem.currentFolderId = "root";
            this.fileSystem.renderSidebar();
            this.notes.renderNotes();
        }
        if (pageId === 'mappa') { 
            this.graph.render(); 
        }
    }

    /**
     * Calcola i dati analitici dalle note attive e istanzia/aggiorna i grafici Chart.js
     * @param {Array} activeNotes - Array contenente tutte le note non cestinate dell'utente.
     */
    renderCharts(activeNotes) {
        const ctxPrio = document.getElementById('priorityChart');
        const ctxWs = document.getElementById('workspaceChart');
        const ctxTag = document.getElementById('tagChart');
        
        if (!ctxPrio || !ctxWs || !ctxTag || typeof Chart === 'undefined') return;

        const prioCounts = { alta: 0, media: 0, bassa: 0 };
        const wsCounts = {};
        const tagCounts = {};

        activeNotes.forEach(n => {
            if (prioCounts[n.priority] !== undefined) prioCounts[n.priority]++;

            if (n.folderId) {
                const folder = this.fileSystem ? this.loggedUser.folders.find(f => f.id === n.folderId) : null;
                const folderName = folder ? folder.name : "Cartella Eliminata";
                wsCounts[folderName] = (wsCounts[folderName] || 0) + 1;
            }

            if (n.tags && Array.isArray(n.tags)) {
                n.tags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
            }
        });

        // Visibilità Container Grafici
        const hasRealFoldersWithNotes = Object.keys(wsCounts).length > 0;
        document.getElementById("wsChartPlaceholder")?.classList.toggle("hidden", hasRealFoldersWithNotes);
        document.getElementById("wsChartContainer")?.classList.toggle("hidden", !hasRealFoldersWithNotes);

        const hasNotes = activeNotes.length > 0;
        const hasCustomWs = Object.keys(wsCounts).filter(w => w !== "Generale").length > 0;
        const hasTags = Object.keys(tagCounts).length > 0;

        document.getElementById("prioChartPlaceholder")?.classList.toggle("hidden", hasNotes);
        document.getElementById("prioChartContainer")?.classList.toggle("hidden", !hasNotes);
        document.getElementById("wsChartPlaceholder")?.classList.toggle("hidden", hasCustomWs);
        document.getElementById("wsChartContainer")?.classList.toggle("hidden", !hasCustomWs);
        document.getElementById("tagChartPlaceholder")?.classList.toggle("hidden", hasTags);
        document.getElementById("tagChartContainer")?.classList.toggle("hidden", !hasTags);

        // Processamento Dati
        const processData = (obj, limit) => {
            const sorted = Object.entries(obj).sort((a, b) => b[1] - a[1]);
            return { full: sorted, top: sorted.slice(0, limit), isTruncated: sorted.length > limit };
        };

        const wsData = processData(wsCounts, 5);
        const tagData = processData(tagCounts, 8);

        const btnWs = document.getElementById("btnShowAllWs");
        const btnTag = document.getElementById("btnShowAllTags");
        
        if (btnWs) {
            btnWs.classList.toggle("hidden", !wsData.isTruncated);
            btnWs.onclick = () => this.openFullChart('Tutti i Workspace', wsData.full, 'bar');
        }
        if (btnTag) {
            btnTag.classList.toggle("hidden", !tagData.isTruncated);
            btnTag.onclick = () => this.openFullChart('Tutti i Tag', tagData.full, 'bar_horizontal');
        }

        // Variabili CSS Theme
        const root = getComputedStyle(document.documentElement);
        const colErr = root.getPropertyValue('--badge-err-t').trim() || '#ff4d4d';
        const colWarn = root.getPropertyValue('--badge-warn-t').trim() || '#ffcc00';
        const colOk = root.getPropertyValue('--badge-ok-t').trim() || '#4dff4d';
        const colText = root.getPropertyValue('--text-2').trim() || '#888';
        const colBorder = root.getPropertyValue('--border').trim() || '#333';
        const colAccent = root.getPropertyValue('--accent').trim() || '#007bff';
        this.chartColors = { colText, colBorder, colAccent };

        if (window.priorityChartInstance) window.priorityChartInstance.destroy();
        if (window.workspaceChartInstance) window.workspaceChartInstance.destroy();
        if (window.tagChartInstance) window.tagChartInstance.destroy();

        if (hasNotes) {
            window.priorityChartInstance = new Chart(ctxPrio, {
                type: 'doughnut',
                data: { labels: ['Alta', 'Media', 'Bassa'], datasets: [{ data: [prioCounts.alta, prioCounts.media, prioCounts.bassa], backgroundColor: [colErr, colWarn, colOk], borderColor: colBorder, borderWidth: 2 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: colText } } } }
            });
        }

        if (hasCustomWs) {
            window.workspaceChartInstance = new Chart(ctxWs, {
                type: 'bar',
                data: { labels: wsData.top.map(d => d[0]), datasets: [{ label: 'Note', data: wsData.top.map(d => d[1]), backgroundColor: colAccent, borderRadius: 4 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: colText } }, y: { ticks: { color: colText, stepSize: 1 } } } }
            });
        }

        if (hasTags) {
            window.tagChartInstance = new Chart(ctxTag, {
                type: 'bar',
                data: { labels: tagData.top.map(d => d[0]), datasets: [{ label: 'Frequenza', data: tagData.top.map(d => d[1]), backgroundColor: 'rgba(75, 192, 192, 0.6)', borderColor: 'rgba(75, 192, 192, 1)', borderWidth: 1, borderRadius: 4 }] },
                options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: colText, stepSize: 1 }, grid: { color: colBorder } }, y: { ticks: { color: colText } } } }
            });
        }
    }

    /**
     * Verifica se un utente è loggato. In caso positivo carica i dati e la schermata corretta,
     * altrimenti mostra la landing page per il login.
     */
    checkLoginState() {
        const loader = document.getElementById("loader");
        const loaderFill = document.getElementById("loaderFill");
        const authScreen = document.getElementById("landing-page");
        const appScreen = document.getElementById("app");

        if (loader) {
            loader.classList.add("visible");
            loader.style.visibility = "visible";
            loader.style.opacity = "1";
            loader.style.pointerEvents = "auto";
        }

        const updateProgress = (perc) => { 
            if (loaderFill) loaderFill.style.width = perc + "%"; 
        };
        
        updateProgress(30);

        if (this.loggedUser) {
            try {
                authScreen.classList.add("hidden");
                appScreen.classList.remove("hidden");

                updateProgress(60);

                this.fileSystem.init();
                this.fileSystem.renderSidebar();
                this.fileSystem.updateSelects();
                this.auth.updateUI();
                this.auth.populateProfile();
                this.gamification.init();
                this.plans.initSecurityHooks();
                this.maintainTrash();
                this.startTimer();
                this.checkExpiring();
                this.calendar.render();
                this.notes.renderNotes();
                this.updateStats();

                updateProgress(90);

                let lastPage = localStorage.getItem("zenith_lastPage");

                // Gestione riavvio sicuro su Tutte le Note in caso di dati corrotti
                if (!lastPage || lastPage === "undefined" || lastPage === "null") {
                    lastPage = "mie-note";
                }

                if (lastPage === 'mie-note') {
                    const savedFolder = localStorage.getItem("zenith_lastFolderId");

                    const folderExists = savedFolder &&
                        savedFolder !== "root" &&
                        savedFolder !== "null" &&
                        savedFolder !== "undefined" &&
                        (this.loggedUser.folders || []).some(f => f.id === savedFolder);

                    if (folderExists) {
                        this.fileSystem.showFolder(savedFolder);
                    } else {
                        this.navigate('mie-note');
                    }
                } else {
                    this.navigate(lastPage);
                }

            } catch (error) {
                console.error("Errore durante l'avvio:", error);
            }

            setTimeout(() => {
                updateProgress(100);
                setTimeout(() => {
                    if (loader) {
                        loader.classList.remove("visible");
                        loader.style.visibility = "hidden";
                        loader.style.opacity = "0";
                        loader.style.pointerEvents = "none";
                    }
                }, 400);
            }, 300);

        } else {
            authScreen.classList.remove("hidden");
            appScreen.classList.add("hidden");
            updateProgress(100);
            
            setTimeout(() => {
                if (loader) {
                    loader.classList.remove("visible");
                    loader.style.visibility = "hidden";
                    loader.style.opacity = "0";
                    loader.style.pointerEvents = "none";
                }
            }, 500);
        }
        
        this.gamification.init();
    }

    /**
     * Decripta il vault (note, cartelle e impostazioni) in memoria RAM.
     * @param {string} password - La Master Password dell'utente.
     * @returns {boolean} True se il decriptaggio ha avuto successo, False altrimenti.
     */
    unlockVault(password) {
        if (!this.loggedUser || !this.loggedUser.notes) return true; 

        if (typeof this.loggedUser.notes === 'string') {
            const decrypted = Utils.decrypt(this.loggedUser.notes, password);
            if (!decrypted) return false; 

            this.loggedUser.notes = JSON.parse(decrypted);
            
            if (this.loggedUser.folders) {
                const decFolders = Utils.decrypt(this.loggedUser.folders, password);
                this.loggedUser.folders = decFolders ? JSON.parse(decFolders) : [];
            }
            
            if (this.loggedUser.theme && typeof this.loggedUser.theme === 'string' && this.loggedUser.theme.length > 30) {
                this.loggedUser.theme = Utils.decrypt(this.loggedUser.theme, password);
            }
            
            if (this.loggedUser.settings && typeof this.loggedUser.settings === 'string') {
                const decSettings = Utils.decrypt(this.loggedUser.settings, password);
                if (decSettings) this.settings = JSON.parse(decSettings); 
            }
        }
        
        this.masterKey = password; 
        return true;
    }

    /**
     * Salva l'oggetto globale dell'utente (con note, cartelle e dati) nel LocalStorage, criptandolo se necessario.
     */
    saveUser() {
        if (!this.loggedUser) return;

        let userToSave = JSON.parse(JSON.stringify(this.loggedUser));

        if (this.masterKey) {
            userToSave.notes = Utils.encrypt(JSON.stringify(this.loggedUser.notes), this.masterKey);
            userToSave.folders = Utils.encrypt(JSON.stringify(this.loggedUser.folders), this.masterKey);
            userToSave.theme = Utils.encrypt(this.loggedUser.theme || 'dark', this.masterKey);
            userToSave.settings = Utils.encrypt(JSON.stringify(this.settings), this.masterKey);
            userToSave.cryptoCheck = Utils.encrypt("ZENITH_AUTH_OK", this.masterKey);
        }

        const idx = this.users.findIndex(u => u.id === userToSave.id);
        if (idx !== -1) this.users[idx] = userToSave;

        localStorage.setItem("users", JSON.stringify(this.users));
        localStorage.removeItem("loggedUser");
    }

    /**
     * Aggiorna i contatori analitici nel profilo e avvia il rendering dei grafici.
     */
    updateStats() {
        if (!this.loggedUser) return;

        const userNotes = this.loggedUser.notes || [];
        const active = userNotes.filter(n => n.status !== 'trashed');
        const trashed = userNotes.filter(n => n.status === 'trashed');
        
        const now = new Date();
        const tom = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const expiring = active.filter(n => n.dueDate && new Date(n.dueDate) > now && new Date(n.dueDate) <= tom);

        if (document.getElementById("stat-totale")) document.getElementById("stat-totale").textContent = active.length;
        if (document.getElementById("stat-scadenza")) document.getElementById("stat-scadenza").textContent = expiring.length;
        if (document.getElementById("stat-cestino")) document.getElementById("stat-cestino").textContent = trashed.length;

        try {
            this.renderCharts(active);
        } catch (e) {
            console.warn("Errore durante il rendering dei grafici", e);
        }
    }

    /**
     * Apre la modale per la visualizzazione a pieno schermo dei grafici analitici.
     * @param {string} title - Titolo del grafico.
     * @param {Array} dataArray - Dati da visualizzare.
     * @param {string} type - 'bar' o 'bar_horizontal'.
     */
    openFullChart(title, dataArray, type) {
        document.getElementById("fullChartModal").classList.remove("hidden");
        document.getElementById("fullChartTitle").textContent = `📈 ${title}`;
        
        const ctx = document.getElementById('fullChartCanvas');
        if (window.fullChartInstance) window.fullChartInstance.destroy();

        const color = type === 'bar' ? this.chartColors.colAccent : 'rgba(75, 192, 192, 0.6)';
        const border = type === 'bar' ? 'transparent' : 'rgba(75, 192, 192, 1)';

        window.fullChartInstance = new Chart(ctx, {
            type: 'bar',
            data: { 
                labels: dataArray.map(d => d[0]), 
                datasets: [{ 
                    label: 'Conteggio Note', 
                    data: dataArray.map(d => d[1]), 
                    backgroundColor: color, 
                    borderColor: border, 
                    borderWidth: 1, 
                    borderRadius: 4 
                }] 
            },
            options: {
                indexAxis: type === 'bar_horizontal' ? 'y' : 'x',
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: this.chartColors.colText, stepSize: 1 }, grid: { color: this.chartColors.colBorder } },
                    y: { ticks: { color: this.chartColors.colText, stepSize: 1 }, grid: { color: this.chartColors.colBorder } }
                }
            }
        });
    }

    /**
     * Avvia un timer in background per il controllo scadenze (ogni minuto).
     * Se una nota scade, la sposta nel cestino o la distrugge.
     */
    startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        
        this.timerInterval = setInterval(() => {
            let nr = false; 
            const now = new Date();
            
            this.loggedUser.notes.forEach(note => { 
                if (note.status !== 'trashed' && note.dueDate) { 
                    if (now >= new Date(note.dueDate)) { 
                        if (note.pin && this.settings.autoDestroy) {
                            this.loggedUser.notes = this.loggedUser.notes.filter(n => n.id !== note.id); 
                        } else { 
                            note.status = 'trashed'; 
                            note.trashedAt = Date.now(); 
                        } 
                        nr = true; 
                    } 
                } 
            });
            
            if (nr) { 
                this.saveUser(); 
                this.notes.renderNotes(); 
                this.updateStats(); 
                this.calendar.render(); 
            }
        }, 60000);
    }

    /**
     * Controlla le note in scadenza entro le 24 ore per lanciare la notifica alert.
     */
    checkExpiring() {
        const now = new Date(); 
        const tom = new Date(now.getTime() + 24 * 60 * 60 * 1000); 
        let exp = [];
        
        this.loggedUser.notes.forEach(note => { 
            if (note.status !== 'trashed' && note.dueDate && !note.alerted) { 
                const lim = new Date(note.dueDate); 
                if (lim > now && lim <= tom) { 
                    exp.push(note); 
                    note.alerted = true; 
                } 
            } 
        });
        
        if (exp.length > 0) { 
            this.saveUser(); 
            const listDiv = document.getElementById("alertList"); 
            listDiv.innerHTML = exp.map(n => `<div>• <b>${n.title}</b></div>`).join(''); 
            document.getElementById("alertModal").classList.remove("hidden"); 
        }
    }

    /**
     * Elimina permanentemente le note che stazionano nel cestino da più di 7 giorni.
     */
    maintainTrash() {
        const now = Date.now();
        const sev = 7 * 24 * 60 * 60 * 1000;
        let c = false;
        
        this.loggedUser.notes = this.loggedUser.notes.filter(note => {
            if (note.status === 'trashed' && note.trashedAt && (now - note.trashedAt > sev)) {
                c = true;
                return false;
            }
            return true;
        });
        
        if (c) this.saveUser();
    }

    /**
     * Genera e scarica un file JSON di backup con i dati completi dell'utente.
     */
    exportBackup() {
        const dataStr = JSON.stringify(this.loggedUser, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Zenith_${this.loggedUser.nome}.json`;
        a.click();
    }

    /**
     * Legge un file JSON caricato dall'utente e tenta il ripristino del database locale.
     * @param {Event} event - L'evento originato dall'input file.
     */
    importBackup(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data && data.id && data.notes) {
                    this.loggedUser.notes = data.notes;
                    if (data.folders) this.loggedUser.folders = data.folders;
                    this.saveUser();
                    this.notes.renderNotes();
                    this.updateStats();
                    this.calendar.render();
                    this.auth.populateProfile();
                    this.fileSystem.renderSidebar();
                    this.fileSystem.updateSelects();
                    if (typeof Utils !== 'undefined') Utils.showToast("Backup importato!");
                }
            } catch (err) { 
                alert("Errore lettura JSON."); 
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }
}

// Istanziazione globale dell'applicazione all'avvio del file
const app = new ZenithEngine();
window.app = app;