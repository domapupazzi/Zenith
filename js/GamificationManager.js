/**
 * @class GamificationManager
 * @description Gestisce i Punti Esperienza (XP), il Livello dell'Utente, i Badge (Medaglie) e i Titoli Equipaggiabili.
 * Regola inoltre le code di celebrazione (Level Up/Unlock) e integra i sistemi anti-spam 
 * (Daily Limits e Cooldown) per evitare abusi di XP.
 */
class GamificationManager {
    /**
     * Costruttore: Inizializza il motore di Gamification.
     * @param {Object} app - Istanza principale dell'applicazione (ZenithEngine).
     */
    constructor(app) {
        this.app = app;
        
        // Modalità Sviluppatore: Se TRUE, i sistemi anti-spam non bloccheranno i punti (solo per test).
        this.DEBUG_MODE = true; 

        // Sistema di accodamento: Gestisce le popup multiple (es. ottieni punti + fai Level Up simultaneamente)
        this.celebrationQueue = [];
        this.isShowingCelebration = false;

        // Dizionario (Database Locale) dei Badge sbloccabili
        this.badgeDictionary = {
            "first_note": { icon: "📝", name: "Il Primo Passo", desc: "Hai creato la tua primissima nota." },
            "trash_cleaner": { icon: "🧹", name: "Spazzino", desc: "Hai svuotato il cestino per la prima volta." },
            "tag_master": { icon: "🏷️", name: "Maestro dei Tag", desc: "Hai creato il tuo primo tag personalizzato." },
            "first_folder": { icon: "📂", name: "Ingegnere Civile", desc: "Hai creato la tua prima cartella." }, 
            "level_5": { icon: "⭐", name: "Aspirante Scrittore", desc: "Hai raggiunto il Livello 5." },
            "level_10": { icon: "💎", name: "Esperto di Flusso", desc: "Hai raggiunto il Livello 10." } 
        };
    }

    /**
     * Inizializza il sistema verificando se l'oggetto gamification esiste nel profilo utente.
     * In caso negativo, ne crea uno nuovo con statistiche azzerate.
     */
    init() {
        if (!this.app.loggedUser) return;

        // Creazione dello scheletro dati di base se assente
        if (!this.app.loggedUser.gamification) {
            this.app.loggedUser.gamification = {
                xp: 0,
                level: 1,
                unlockedBadges: [],
                equippedTitle: "Novizio della Tastiera",
                equippedBadge: null,
                dailyStats: {
                    lastResetDate: new Date().toDateString(),
                    notesCreated: 0,
                    tagsCreated: 0,
                    foldersCreated: 0
                },
                cooldowns: {
                    lastTrashEmpty: null
                }
            };
            this.app.saveUser();
        }

        // Controllo automatico reset giornaliero e sincronizzazione UI
        this.checkDailyReset();
        this.updateUI(); 
        
        if (this.DEBUG_MODE) {
            console.log("🎮 Gamification Engine Avviato! Livello:", this.app.loggedUser.gamification.level, "- XP:", this.app.loggedUser.gamification.xp);
        }
    }

    /**
     * Seleziona o deseleziona un Badge dalla bacheca per equipaggiarlo come Avatar/Titolo.
     * @param {string} badgeId - L'ID univoco del badge da selezionare.
     */
    selectBadge(badgeId) {
        const gData = this.app.loggedUser.gamification;
        let msg = ""; 

        // Toggle logico: se clicchi il badge già equipaggiato, lo togli.
        if (gData.equippedBadge === badgeId) {
            gData.equippedBadge = null;
            gData.equippedTitle = "Novizio della Tastiera";
            msg = "Badge deselezionato! 🧊";
        } else {
            gData.equippedBadge = badgeId;
            gData.equippedTitle = this.badgeDictionary[badgeId].name;
            msg = "Badge selezionato! ✨";
        }
        
        this.app.saveUser();
        this.updateUI();
        
        if (typeof Utils !== 'undefined') {
            Utils.showToast(msg); 
        }
    }

    /**
     * Confronta la data attuale con quella salvata. 
     * Se è scattato un nuovo giorno, azzera i contatori anti-spam.
     */
    checkDailyReset() {
        const gData = this.app.loggedUser.gamification;
        const today = new Date().toDateString();

        if (gData.dailyStats.lastResetDate !== today) {
            gData.dailyStats.lastResetDate = today;
            gData.dailyStats.notesCreated = 0;
            gData.dailyStats.tagsCreated = 0;
            gData.dailyStats.foldersCreated = 0; 
            
            this.app.saveUser();
            if (this.DEBUG_MODE) console.log("🔄 Gamification: Limiti giornalieri resettati.");
        }
    }

    /**
     * Funzione Core: Assegna XP all'utente, salva il progresso e innesca i controlli 
     * per eventuali Level Up.
     * @param {number} amount - La quantità di XP da aggiungere.
     * @param {string} [reason="Azione eseguita"] - Etichetta di debug.
     */
    addXP(amount, reason = "Azione eseguita") {
        const gData = this.app.loggedUser.gamification;
        gData.xp += amount;
        
        if (this.DEBUG_MODE) console.log(`+${amount} XP (${reason})`);

        this.app.saveUser();
        this.checkLevelUp();
        this.updateUI(); 
    }

    /**
     * Controlla matematicamente se l'XP attuale supera o uguaglia la soglia necessaria (Livello * 100).
     * Gestisce ricorsivamente i "multi-level up" se l'utente guadagna un'enorme quantità di XP in un colpo solo.
     */
    checkLevelUp() {
        const gData = this.app.loggedUser.gamification;
        const requiredXP = gData.level * 100; 

        if (gData.xp >= requiredXP) {
            // Sottrae il costo del livello e scala la progressione
            gData.xp -= requiredXP; 
            gData.level += 1;
            
            this.queueCelebration("LEVEL UP!", `Congratulazioni! Sei ora al Livello ${gData.level}!`, "🎉");
            
            // Hook speciale per i traguardi
            if (gData.level === 5) this.unlockBadge("level_5");
            if (gData.level === 10) this.unlockBadge("level_10");

            this.app.saveUser();
            this.checkLevelUp(); // Ricorsione per eventuali livelli accumulati (es. guadagna +300XP a Liv.1)
        }
    }

    /**
     * Assegna un Badge all'utente se non lo possiede già e lancia la celebrazione.
     * @param {string} badgeId - L'ID del badge sbloccato.
     */
    unlockBadge(badgeId) {
        const gData = this.app.loggedUser.gamification;
        
        if (!gData.unlockedBadges.includes(badgeId)) {
            gData.unlockedBadges.push(badgeId);
            const badgeInfo = this.badgeDictionary[badgeId];
            
            if (badgeInfo) {
                this.queueCelebration("NUOVO BADGE!", `${badgeInfo.name}\n${badgeInfo.desc}`, badgeInfo.icon);
            }
            this.app.saveUser();
        }
    }

    /**
     * Aggiunge un evento festivo (Level Up / Badge) alla coda in background.
     * @param {string} title - Titolo della Popup.
     * @param {string} message - Corpo del messaggio.
     * @param {string} icon - Emoji o Icona associata.
     */
    queueCelebration(title, message, icon) {
        this.celebrationQueue.push({ title, message, icon });
        this.processQueue();
    }

    /**
     * Legge la coda delle celebrazioni. Se l'utente non sta già guardando una modale, 
     * estrae la prima notifica disponibile, aggiorna il DOM e innesca la pioggia di coriandoli.
     */
    processQueue() {
        if (this.isShowingCelebration || this.celebrationQueue.length === 0) return;

        this.isShowingCelebration = true;
        const data = this.celebrationQueue.shift(); 
        
        const modal = document.getElementById("celebrationModal");
        if (!modal) return;
        
        document.getElementById("celebrationTitle").textContent = data.title;
        document.getElementById("celebrationMessage").innerText = data.message;
        
        const iconEl = document.getElementById("celebrationIcon");
        iconEl.textContent = data.icon;
        
        // Reset dell'animazione CSS forzando un reflow
        iconEl.classList.remove("celebration-anim");
        void iconEl.offsetWidth; 
        iconEl.classList.add("celebration-anim");

        modal.classList.remove("hidden");

        // Effetto particellare (Confetti.js) stratificato per massimizzare la spettacolarità
        if (typeof confetti === 'function') {
            const count = 200;
            const defaults = { origin: { y: 0.6 }, zIndex: 5000 }; 

            function fire(particleRatio, opts) {
                confetti(Object.assign({}, defaults, opts, {
                    particleCount: Math.floor(count * particleRatio)
                }));
            }

            fire(0.25, { spread: 26, startVelocity: 55 });
            fire(0.2, { spread: 60 });
            fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
            fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
            fire(0.1, { spread: 120, startVelocity: 45 });
        }
    }

    /**
     * Chiude la modale attiva. Dopo un breve delay per garantire fluidità d'interfaccia, 
     * avvia il caricamento dell'eventuale celebrazione successiva in coda.
     */
    closeCurrentCelebration() {
        const modal = document.getElementById("celebrationModal");
        if (modal) modal.classList.add("hidden");
        
        this.isShowingCelebration = false;
        
        setTimeout(() => {
            this.processQueue();
            this.updateUI();
        }, 300);
    }

    // ==========================================
    // 🛡️ SCUDI ANTI-SPAM
    // ==========================================

    /**
     * Controlla che un'azione ripetibile non superi il cap XP prestabilito per la giornata.
     * @param {string} actionType - Identificatore dell'azione (es. 'notesCreated').
     * @param {number} maxLimit - Massimo di esecuzioni premiate consentite in un giorno.
     * @returns {boolean} True se può prendere punti, False se bloccato.
     */
    canGainDailyXP(actionType, maxLimit) {
        const gData = this.app.loggedUser.gamification;
        const currentCount = gData.dailyStats[actionType] || 0;

        if (currentCount >= maxLimit) {
            if (this.DEBUG_MODE) {
                console.log(`🛡️ [DEBUG] Limite ${actionType} raggiunto, ma i punti vengono assegnati (Debug Mode = ON).`);
                return true; 
            }
            return false; 
        }

        gData.dailyStats[actionType] = currentCount + 1;
        return true;
    }

    /**
     * Controlla che un'azione temporizzata non avvenga prima della fine del suo periodo di ricarica.
     * @param {string} cooldownName - Identificatore del timer (es. 'lastTrashEmpty').
     * @param {number} oreAttesa - Ore necessarie per far scattare di nuovo l'azione.
     * @returns {boolean} True se il cooldown è scaduto, False se è ancora in corso.
     */
    checkCooldown(cooldownName, oreAttesa) {
        const gData = this.app.loggedUser.gamification;
        const lastActionTime = gData.cooldowns[cooldownName];
        const now = Date.now();

        if (lastActionTime) {
            const orePassate = (now - lastActionTime) / (1000 * 60 * 60);
            if (orePassate < oreAttesa) {
                if (this.DEBUG_MODE) {
                    console.log(`🛡️ [DEBUG] Cooldown ${cooldownName} in corso, ma bypassato (Debug Mode = ON).`);
                    return true;
                }
                return false; 
            }
        }

        gData.cooldowns[cooldownName] = now;
        return true;
    }

    // ==========================================
    // 🎨 UI E INTERFACCIA
    // ==========================================

    /**
     * Sincronizza tutti gli elementi grafici dell'applicazione (Sidebars, Profilo, Dashboard) 
     * con lo stato XP/Livello/Equipaggiamento corrente dell'utente.
     */
    updateUI() {
        if (!this.app.loggedUser || !this.app.loggedUser.gamification) return;
        
        const gData = this.app.loggedUser.gamification;
        const requiredXP = gData.level * 100;
        const xpPercent = (gData.xp / requiredXP) * 100;

        // --- Aggiornamento Componenti Sidebar ---
        const sideBar = document.getElementById("sidebarXPBar");
        const sideLevel = document.getElementById("sidebarLevelBadge");
        if (sideBar) sideBar.style.width = xpPercent + "%";
        if (sideLevel) sideLevel.textContent = gData.level;

        // --- Aggiornamento Componenti Vista Profilo ---
        const profLevel = document.getElementById("userLevelBadge");
        const profXPBar = document.getElementById("xpBarFill");
        const profXPText = document.getElementById("xpValueDisplay");
        if (profLevel) profLevel.textContent = gData.level;
        if (profXPBar) profXPBar.style.width = xpPercent + "%";
        if (profXPText) profXPText.textContent = `${gData.xp} / ${requiredXP} XP`;
        
        const profName = document.getElementById("profFullnameLarge");
        if (profName) profName.textContent = `${this.app.loggedUser.nome} ${this.app.loggedUser.cognome}`;
        
        const sideName = document.getElementById("userNameDisplay");
        if (sideName) sideName.textContent = `${this.app.loggedUser.nome} ${this.app.loggedUser.cognome}`;

        // --- Gestione Equipaggiamento (Avatars e Titoli) ---
        const profAvatar = document.getElementById("profAvatarLarge");
        const profTitle = document.getElementById("userEquippedTitle");
        const sideAvatar = document.getElementById("userInitials"); 
        const sideTitle = document.getElementById("userSidebarTitle"); 

        if (gData.equippedBadge && this.badgeDictionary[gData.equippedBadge]) {
            const badge = this.badgeDictionary[gData.equippedBadge];
            const icon = badge.icon;
            const name = badge.name;

            if (profAvatar) profAvatar.textContent = icon;
            if (profTitle) profTitle.textContent = name;
            
            if (sideAvatar) sideAvatar.textContent = icon;
            if (sideTitle) sideTitle.textContent = name;
        } else {
            // Stato di Default se nessun badge è equipaggiato
            const initials = (this.app.loggedUser.nome[0] + this.app.loggedUser.cognome[0]).toUpperCase();
            const defaultTitle = "Novizio della Tastiera";

            if (profAvatar) profAvatar.textContent = initials;
            if (profTitle) profTitle.textContent = defaultTitle;
            if (sideAvatar) sideAvatar.textContent = initials;
            if (sideTitle) sideTitle.textContent = defaultTitle;
        }

        // Renderizza infine la matrice visiva dei badge
        this.renderBadgeGrid();
    }

    /**
     * Genera dinamicamente l'HTML per la griglia delle medaglie nella sezione Profilo.
     * Gestisce le classi CSS in base allo stato di Sblocco ed Equipaggiamento.
     */
    renderBadgeGrid() {
        const grid = document.getElementById("badgeGrid");
        if (!grid) return;
        
        const gData = this.app.loggedUser.gamification;

        grid.innerHTML = Object.entries(this.badgeDictionary).map(([id, badge]) => {
            const isUnlocked = gData.unlockedBadges.includes(id);
            const isEquipped = gData.equippedBadge === id;

            return `
                <div class="badge-item ${isUnlocked ? 'unlocked' : 'locked'} ${isEquipped ? 'selected' : ''}" 
                     ${isUnlocked ? `onclick="app.gamification.selectBadge('${id}')"` : ''}
                     style="${isUnlocked ? 'cursor: pointer;' : ''}">
                    <div class="badge-icon">${badge.icon}</div>
                    <div class="badge-name">${badge.name}</div>
                    <div class="badge-desc">${badge.desc}</div>
                </div>
            `;
        }).join('');
    }
}