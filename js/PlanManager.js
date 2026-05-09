/**
 * @class PlanManager
 * @description Gestisce i piani di abbonamento (Novizio vs Guru) e i limiti delle funzionalità.
 * Si occupa di mostrare il paywall e bloccare le azioni non consentite tramite eventi in Capture Phase.
 */
class PlanManager {
    /**
     * Inizializza il gestore dei piani configurando i limiti e i permessi di default.
     * @param {Object} app - L'istanza principale dell'applicazione (ZenithEngine).
     */
    constructor(app) {
        this.app = app;
        
        // Dizionario dei Piani e dei Limiti associati
        this.plans = {
            novizio: {
                name: "Piano Novizio",
                maxFolders: 3,
                allowedThemes: ['dark', 'light', 'gradient'],
                features: { graph: false, settingsLayout: false, settingsEditor: false }
            },
            guru: {
                name: "Piano Guru 👑",
                maxFolders: Infinity,
                allowedThemes: 'all', // Sblocca tutti i temi
                features: { graph: true, settingsLayout: true, settingsEditor: true }
            }
        };
    }

    /**
     * Recupera il piano attuale dell'utente loggato.
     * @returns {Object} L'oggetto contenente le regole del piano attuale.
     */
    get currentPlan() {
        if (!this.app.loggedUser) return this.plans.novizio;
        const planKey = this.app.loggedUser.plan || 'novizio';
        return this.plans[planKey] || this.plans.novizio;
    }

    /**
     * Aggiorna le classi CSS del body per mostrare o nascondere elementi UI 
     * specifici per i piani (es. icone con la corona per i contenuti premium).
     */
    updateUI() {
        const body = document.body;
        body.classList.remove('plan-novizio', 'plan-guru'); 
        
        const planKey = this.app.loggedUser ? (this.app.loggedUser.plan || 'novizio') : 'novizio';
        body.classList.add(`plan-${planKey}`); 
    }

    /**
     * Mostra la modale del Paywall quando l'utente tenta di accedere a una funzione bloccata.
     */
    showPaywallMessage() {
        const modal = document.getElementById("paywallModal");
        if (modal) {
            modal.classList.remove("hidden");
        }
    }

    /**
     * Inizializza gli ascoltatori di eventi per la modale del Paywall,
     * inclusa la logica di upgrade istantaneo al piano Guru.
     */
    initPaywallEvents() {
        // Chiusura della modale
        document.getElementById("closePaywallBtn")?.addEventListener("click", () => {
            document.getElementById("paywallModal").classList.add("hidden");
        });

        // Logica di Upgrade Istantaneo
        document.getElementById("modalUpgradeToGuruBtn")?.addEventListener("click", () => {
            if (!this.app.loggedUser) return;

            // 1. Applica il cambio piano in RAM
            this.app.loggedUser.plan = 'guru';

            // 2. Aggiorna la sessione attiva per evitare reset al reload
            if (sessionStorage.getItem("zenith_volatile_user")) {
                sessionStorage.setItem("zenith_volatile_user", JSON.stringify(this.app.loggedUser));
            }

            // 3. Salva nel database principale (LocalStorage)
            this.app.saveUser();

            // 4. Feedback visivo
            document.getElementById("paywallModal").classList.add("hidden");
            if (typeof Utils !== 'undefined') {
                Utils.showToast("⚡ Evoluzione in corso... Benvenuto nel piano Guru!");
            }

            // 5. Ricarica la pagina per far leggere i nuovi dati a ZenithEngine
            setTimeout(() => {
                location.reload();
            }, 1200);
        });
    }

    // ==========================================
    // 🛡️ CONTROLLI SPECIFICI DEI LIMITI
    // ==========================================

    /**
     * Verifica se una specifica funzionalità è sbloccata nel piano attuale.
     * @param {string} featureId - L'ID della feature da controllare.
     * @returns {boolean} True se consentito, False altrimenti (mostrando il paywall).
     */
    checkFeature(featureId) {
        if (this.currentPlan.features[featureId]) return true;
        this.showPaywallMessage();
        return false;
    }

    /**
     * Verifica se l'utente può creare un'ulteriore cartella.
     * @param {number} currentFolderCount - Il numero attuale di cartelle possedute.
     * @returns {boolean} True se consentito, False altrimenti.
     */
    canAddFolder(currentFolderCount) {
        if (currentFolderCount < this.currentPlan.maxFolders) return true;
        this.showPaywallMessage();
        return false;
    }

    /**
     * Verifica se l'utente ha il permesso di applicare un determinato tema.
     * @param {string} themeId - L'ID del tema da controllare.
     * @returns {boolean} True se consentito, False altrimenti.
     */
    canUseTheme(themeId) {
        if (this.currentPlan.allowedThemes === 'all' || this.currentPlan.allowedThemes.includes(themeId)) return true;
        this.showPaywallMessage();
        return false;
    }

    // ==========================================
    // 🥷 L'INTERCETTATORE INVISIBILE (Capture Phase)
    // ==========================================

    /**
     * Applica gli "hook" di sicurezza intercettando i click in fase di cattura (Capture Phase).
     * Questo permette di bloccare l'evento prima che raggiunga gli altri script se la funzione non è sbloccata.
     */
    initSecurityHooks() {
        this.updateUI(); 
        this.initPaywallEvents(); 

        // 1. Blocco Temi Premium
        document.querySelectorAll('.theme-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const themeId = btn.dataset.theme;
                if (!this.canUseTheme(themeId)) {
                    e.stopPropagation(); // Ferma la propagazione, non arriverà al SettingsManager
                }
            }, true); // 'true' = Capture Phase
        });

        // 2. Blocco Tab Impostazioni (Layout ed Editor)
        const blockedTabs = ['tab-layout', 'tab-editor'];
        document.querySelectorAll('.settings-nav-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabId = btn.dataset.tab;
                if (blockedTabs.includes(tabId)) {
                    const featureKey = tabId === 'tab-layout' ? 'settingsLayout' : 'settingsEditor';
                    if (!this.checkFeature(featureKey)) {
                        e.stopPropagation();
                    }
                }
            }, true); // 'true' = Capture Phase
        });

        // 3. Blocco Creazione Cartelle (Workspaces) oltre il limite
        const addWsBtn = document.getElementById('addWorkspaceBtn');
        if (addWsBtn) {
            addWsBtn.addEventListener('click', (e) => {
                const currentCount = this.app.loggedUser && this.app.loggedUser.folders ? this.app.loggedUser.folders.length : 0;
                if (!this.canAddFolder(currentCount)) {
                    e.stopPropagation();
                }
            }, true); // 'true' = Capture Phase
        }
    }
}