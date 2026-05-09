/**
 * @class GamificationManager
 * @description Gestisce i Punti Esperienza (XP), il Livello Utente, i Badge e i titoli.
 * Contiene anche i sistemi anti-spam e la coda delle celebrazioni.
 */
class GamificationManager {
    constructor(app) {
        this.app = app;
        
        // 🟢 MODALITÀ SVILUPPATORE: Se TRUE, bypassa i blocchi Anti-Spam per farti testare!
        this.DEBUG_MODE = true; 

        // 🟢 Sistema di Coda Celebrazioni
        this.celebrationQueue = [];
        this.isShowingCelebration = false;

        // Dizionario di tutti i Badge disponibili
        this.badgeDictionary = {
            "first_note": { icon: "📝", name: "Il Primo Passo", desc: "Hai creato la tua primissima nota." },
            "trash_cleaner": { icon: "🧹", name: "Spazzino", desc: "Hai svuotato il cestino per la prima volta." },
            "tag_master": { icon: "🏷️", name: "Maestro dei Tag", desc: "Hai creato il tuo primo tag personalizzato." },
            "first_folder": { icon: "📂", name: "Ingegnere Civile", desc: "Hai creato la tua prima cartella." }, // 🟢 NUOVO
            "level_5": { icon: "⭐", name: "Aspirante Scrittore", desc: "Hai raggiunto il Livello 5." },
            "level_10": { icon: "💎", name: "Esperto di Flusso", desc: "Hai raggiunto il Livello 10." } // 🟢 NUOVO
        };
    }

    /**
     * Inizializza o recupera i dati di gioco dell'utente loggato.
     */
    init() {
        if (!this.app.loggedUser) return;

        // Se l'utente non ha ancora il modulo gamification, glielo creiamo
        if (!this.app.loggedUser.gamification) {
            this.app.loggedUser.gamification = {
                xp: 0,
                level: 1,
                unlockedBadges: [],
                equippedTitle: "Novizio della Tastiera",
                equippedBadge: null,
                // Tracciamento Anti-Spam
                dailyStats: {
                    lastResetDate: new Date().toDateString(),
                    notesCreated: 0,
                    tagsCreated: 0
                },
                cooldowns: {
                    lastTrashEmpty: null
                }
            };
            this.app.saveUser();
        }

        // Controllo giornaliero: resetta i contatori se è un nuovo giorno
        this.checkDailyReset();
        this.updateUI(); // Aggiorna la grafica istantaneamente
        
        console.log("🎮 Gamification Engine Avviato! Livello:", this.app.loggedUser.gamification.level, "- XP:", this.app.loggedUser.gamification.xp);
    }
    /**
     * 🟢 NUOVO: Permette di equipaggiare un badge sbloccato.
     */
    selectBadge(badgeId) {
        const gData = this.app.loggedUser.gamification;
        let msg = ""; // Messaggio personalizzato per il toast

        if (gData.equippedBadge === badgeId) {
            // DESELEZIONE
            gData.equippedBadge = null;
            gData.equippedTitle = "Novizio della Tastiera";
            msg = "Badge deselezionato! 🧊";
        } else {
            // SELEZIONE
            gData.equippedBadge = badgeId;
            gData.equippedTitle = this.badgeDictionary[badgeId].name;
            msg = "Badge selezionato! ✨";
        }
        
        this.app.saveUser();
        this.updateUI();
        
        if (typeof Utils !== 'undefined') {
            Utils.showToast(msg); // Ora il messaggio è corretto
        }
    }

    /**
     * Resetta i limiti giornalieri se l'utente si connette in un giorno diverso dall'ultimo salvato.
     */
    checkDailyReset() {
        const gData = this.app.loggedUser.gamification;
        const today = new Date().toDateString();

        if (gData.dailyStats.lastResetDate !== today) {
            gData.dailyStats.lastResetDate = today;
            gData.dailyStats.notesCreated = 0;
            gData.dailyStats.tagsCreated = 0;
            gData.dailyStats.foldersCreated = 0; // 🟢 AGGIUNTO
            this.app.saveUser();
            if (this.DEBUG_MODE) console.log("🔄 Gamification: Limiti giornalieri resettati.");
        }
    }

    /**
     * Aggiunge Punti Esperienza (XP) in modo SILENZIOSO.
     */
    addXP(amount, reason = "Azione eseguita") {
        const gData = this.app.loggedUser.gamification;
        gData.xp += amount;
        
        if (this.DEBUG_MODE) console.log(`+${amount} XP (${reason})`);

        this.app.saveUser();
        this.checkLevelUp();
        this.updateUI(); // Sincronizza subito la barra nella sidebar
    }

    /**
     * Calcola matematicamente se l'utente ha superato la soglia. Innesca la Celebrazione!
     */
    checkLevelUp() {
        const gData = this.app.loggedUser.gamification;
        const requiredXP = gData.level * 100; 

        if (gData.xp >= requiredXP) {
            gData.xp -= requiredXP; 
            gData.level += 1;
            
            // 🟢 Inserisce in coda il Level Up
            this.queueCelebration("LEVEL UP!", `Congratulazioni! Sei ora al Livello ${gData.level}!`, "🎉");
            
            if (gData.level === 5) this.unlockBadge("level_5");

            this.app.saveUser();
            this.checkLevelUp(); // Controllo a catena se ha fatto tantissimi punti
        }
    }

    /**
     * Sblocca una medaglia (Badge) e innesca la Celebrazione!
     */
    unlockBadge(badgeId) {
        const gData = this.app.loggedUser.gamification;
        
        if (!gData.unlockedBadges.includes(badgeId)) {
            gData.unlockedBadges.push(badgeId);
            const badgeInfo = this.badgeDictionary[badgeId];
            
            if (badgeInfo) {
                // 🟢 Inserisce in coda il Badge
                this.queueCelebration("NUOVO BADGE!", `${badgeInfo.name}\n${badgeInfo.desc}`, badgeInfo.icon);
            }
            this.app.saveUser();
        }
    }

    /** 🟢 Aggiunge una celebrazione alla coda */
    queueCelebration(title, message, icon) {
        this.celebrationQueue.push({ title, message, icon });
        this.processQueue();
    }

    /** 🟢 Mostra la prossima celebrazione se non ce n'è una attiva */
    processQueue() {
        if (this.isShowingCelebration || this.celebrationQueue.length === 0) return;

        this.isShowingCelebration = true;
        const data = this.celebrationQueue.shift(); // Estrae il primo elemento
        
        const modal = document.getElementById("celebrationModal");
        if (!modal) return;
        
        document.getElementById("celebrationTitle").textContent = data.title;
        document.getElementById("celebrationMessage").innerText = data.message;
        
        const iconEl = document.getElementById("celebrationIcon");
        iconEl.textContent = data.icon;
        
        iconEl.classList.remove("celebration-anim");
        void iconEl.offsetWidth; 
        iconEl.classList.add("celebration-anim");

        modal.classList.remove("hidden");

        // 🎊 ESPLOSIONE DI CORIANDOLI SUPER-CARICA 🎊
        if (typeof confetti === 'function') {
            const count = 200;
            // zIndex 5000 assicura che esplodano SOPRA la modale scura
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

    /** 🟢 Chiude la modale attuale e controlla se ne serve un'altra */
    closeCurrentCelebration() {
        const modal = document.getElementById("celebrationModal");
        if (modal) modal.classList.add("hidden");
        
        this.isShowingCelebration = false;
        
        // Aspetta un istante per l'effetto visivo e processa il prossimo
        setTimeout(() => {
            this.processQueue();
            this.updateUI();
        }, 300);
    }

    // ==========================================
    // 🛡️ SCUDI ANTI-SPAM (RIPRISTINATI)
    // ==========================================

    /**
     * Verifica se un'azione ripetibile ha superato il limite giornaliero.
     */
    canGainDailyXP(actionType, maxLimit) {
        const gData = this.app.loggedUser.gamification;
        const currentCount = gData.dailyStats[actionType] || 0;

        if (currentCount >= maxLimit) {
            if (this.DEBUG_MODE) {
                console.log(`🛡️ [DEBUG] Limite ${actionType} raggiunto, ma i punti vengono assegnati lo stesso.`);
                return true; 
            }
            return false; // In produzione, blocca i punti
        }

        // Incrementa il contatore
        gData.dailyStats[actionType] = currentCount + 1;
        return true;
    }

    /**
     * Verifica se un'azione distruttiva/rara (es. Svuota Cestino) ha superato il tempo di attesa.
     */
    checkCooldown(cooldownName, oreAttesa) {
        const gData = this.app.loggedUser.gamification;
        const lastActionTime = gData.cooldowns[cooldownName];
        const now = Date.now();

        if (lastActionTime) {
            const orePassate = (now - lastActionTime) / (1000 * 60 * 60);
            if (orePassate < oreAttesa) {
                if (this.DEBUG_MODE) {
                    console.log(`🛡️ [DEBUG] Cooldown ${cooldownName} in corso, ma bypassato.`);
                    return true;
                }
                return false; // Blocca i punti
            }
        }

        // Registra il nuovo tempo
        gData.cooldowns[cooldownName] = now;
        return true;
    }

    // ==========================================
    // 🎨 UI E INTERFACCIA
    // ==========================================

    /**
     * 🟢 AGGIORNAMENTO UI: Sincronizza tutti gli elementi grafici (barre, livelli, badge).
     */
    updateUI() {
        if (!this.app.loggedUser || !this.app.loggedUser.gamification) return;
        const gData = this.app.loggedUser.gamification;
        const requiredXP = gData.level * 100;
        const xpPercent = (gData.xp / requiredXP) * 100;

        // 1. Sidebar
        const sideBar = document.getElementById("sidebarXPBar");
        const sideLevel = document.getElementById("sidebarLevelBadge");
        if (sideBar) sideBar.style.width = xpPercent + "%";
        if (sideLevel) sideLevel.textContent = gData.level;

        // 2. Profilo - Hero Section
        const profLevel = document.getElementById("userLevelBadge");
        const profXPBar = document.getElementById("xpBarFill");
        const profXPText = document.getElementById("xpValueDisplay");
        if (profLevel) profLevel.textContent = gData.level;
        if (profXPBar) profXPBar.style.width = xpPercent + "%";
        if (profXPText) profXPText.textContent = `${gData.xp} / ${requiredXP} XP`;
        
        // Nome e Titolo
        const profName = document.getElementById("profFullnameLarge");
        if (profName) profName.textContent = `${this.app.loggedUser.nome} ${this.app.loggedUser.cognome}`;
        const sideName = document.getElementById("userNameDisplay");
        if (sideName) sideName.textContent = `${this.app.loggedUser.nome} ${this.app.loggedUser.cognome}`;

        // 🟢 GESTIONE EQUIPAGGIAMENTO (Profilo E Sidebar)
        const profAvatar = document.getElementById("profAvatarLarge");
        const profTitle = document.getElementById("userEquippedTitle");
        const sideAvatar = document.getElementById("userInitials"); // Avatar sidebar
        const sideTitle = document.getElementById("userSidebarTitle"); // Titolo sidebar

        if (gData.equippedBadge && this.badgeDictionary[gData.equippedBadge]) {
            const badge = this.badgeDictionary[gData.equippedBadge];
            const icon = badge.icon;
            const name = badge.name;

            // Aggiorna Profilo
            if (profAvatar) profAvatar.textContent = icon;
            if (profTitle) profTitle.textContent = name;
            
            // Aggiorna Sidebar (Icona e Titolo)
            if (sideAvatar) sideAvatar.textContent = icon;
            if (sideTitle) sideTitle.textContent = name;
        } else {
            // Reset ai valori predefiniti
            const initials = (this.app.loggedUser.nome[0] + this.app.loggedUser.cognome[0]).toUpperCase();
            const defaultTitle = "Novizio della Tastiera";

            if (profAvatar) profAvatar.textContent = initials;
            if (profTitle) profTitle.textContent = defaultTitle;
            if (sideAvatar) sideAvatar.textContent = initials;
            if (sideTitle) sideTitle.textContent = defaultTitle;
        }

        this.renderBadgeGrid();
    }

    /**
     * Disegna fisicamente i badge nella bacheca medaglie.
     */
    renderBadgeGrid() {
        const grid = document.getElementById("badgeGrid");
        if (!grid) return;
        const gData = this.app.loggedUser.gamification;

        grid.innerHTML = Object.entries(this.badgeDictionary).map(([id, badge]) => {
            const isUnlocked = gData.unlockedBadges.includes(id);
            const isEquipped = gData.equippedBadge === id; // 🟢 Controlla se è indossato

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