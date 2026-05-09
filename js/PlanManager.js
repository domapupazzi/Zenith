/**
 * @class PlanManager
 * @description Gestisce i piani di abbonamento e i limiti delle funzionalità.
 */
class PlanManager {
    constructor(app) {
        this.app = app;
        
        // 📚 Dizionario dei Piani e dei Limiti
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
                allowedThemes: 'all', // Sblocca tutto
                features: { graph: true, settingsLayout: true, settingsEditor: true }
            }
        };
    }

    // Recupera il piano attuale dell'utente
    get currentPlan() {
        if (!this.app.loggedUser) return this.plans.novizio;
        const planKey = this.app.loggedUser.plan || 'novizio';
        return this.plans[planKey] || this.plans.novizio;
    }

    // Aggiorna l'interfaccia in base al piano (Mostra/Nasconde le corone)
    updateUI() {
        const body = document.body;
        body.classList.remove('plan-novizio', 'plan-guru'); 
        
        const planKey = this.app.loggedUser ? (this.app.loggedUser.plan || 'novizio') : 'novizio';
        body.classList.add(`plan-${planKey}`); 
    }

    /**
     * Mostra la modale Paywall
     */
    showPaywallMessage() {
        const modal = document.getElementById("paywallModal");
        if (modal) {
            modal.classList.remove("hidden");
        }
    }

    /**
     * Inizializza gli eventi della modale Paywall
     */
    initPaywallEvents() {
        // Chiude la modale
        document.getElementById("closePaywallBtn")?.addEventListener("click", () => {
            document.getElementById("paywallModal").classList.add("hidden");
        });

        // 🟢 LOGICA DI UPGRADE ISTANTANEO
        document.getElementById("modalUpgradeToGuruBtn")?.addEventListener("click", () => {
            if (!this.app.loggedUser) return;

            // 1. Applica il cambio piano nell'oggetto in RAM
            this.app.loggedUser.plan = 'guru';

            // 2. 🟢 FIX CRITICO: Aggiorna la sessione attiva
            // Senza questo, al reload l'app caricherebbe i vecchi dati dal sessionStorage
            if (sessionStorage.getItem("zenith_volatile_user")) {
                sessionStorage.setItem("zenith_volatile_user", JSON.stringify(this.app.loggedUser));
            }

            // 3. Salva nel database principale (LocalStorage 'users')
            this.app.saveUser();

            // 4. Feedback visivo
            document.getElementById("paywallModal").classList.add("hidden");
            if (typeof Utils !== 'undefined') {
                Utils.showToast("⚡ Evoluzione in corso... Benvenuto nel piano Guru!");
            }

            // 5. Ricarica la pagina: ora ZenithEngine troverà i dati aggiornati ovunque
            setTimeout(() => {
                location.reload();
            }, 1200);
        });
    }

    // ==========================================
    // 🛡️ CONTROLLI SPECIFICI
    // ==========================================

    checkFeature(featureId) {
        if (this.currentPlan.features[featureId]) return true;
        this.showPaywallMessage();
        return false;
    }

    canAddFolder(currentFolderCount) {
        if (currentFolderCount < this.currentPlan.maxFolders) return true;
        this.showPaywallMessage();
        return false;
    }

    canUseTheme(themeId) {
        if (this.currentPlan.allowedThemes === 'all' || this.currentPlan.allowedThemes.includes(themeId)) return true;
        this.showPaywallMessage();
        return false;
    }

    // ==========================================
    // 🥷 L'INTERCETTATORE INVISIBILE (Capture Phase)
    // ==========================================
    initSecurityHooks() {
        this.updateUI(); // Etichetta la pagina al caricamento
        this.initPaywallEvents(); // Attiva i tasti della modale

        // 1. Blocca i Temi Premium
        document.querySelectorAll('.theme-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const themeId = btn.dataset.theme;
                if (!this.canUseTheme(themeId)) {
                    e.stopPropagation(); // Ferma il click! Non arriverà al SettingsManager
                }
            }, true); // 'true' = intercetta PRIMA degli altri script
        });

        // 2. Blocca i Tab delle impostazioni (Layout ed Editor)
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
            }, true);
        });

        // 3. Blocca la creazione di Cartelle (Workspaces) oltre le 3
        const addWsBtn = document.getElementById('addWorkspaceBtn');
        if (addWsBtn) {
            addWsBtn.addEventListener('click', (e) => {
                const currentCount = this.app.loggedUser && this.app.loggedUser.folders ? this.app.loggedUser.folders.length : 0;
                if (!this.canAddFolder(currentCount)) {
                    e.stopPropagation();
                }
            }, true);
        }
    }
}