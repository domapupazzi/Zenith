/**
 * @class AuthManager
 * @description Gestisce la Landing Page, le modali di Login e Registrazione, 
 * la validazione dei dati dell'utente, la gestione del Profilo e i sistemi di sicurezza.
 */
class AuthManager {
    /**
     * Inizializza le variabili di sicurezza di base.
     * @param {Object} app - L'istanza principale di ZenithEngine.
     */
    constructor(app) {
        this.app = app;

        // Variabili di sicurezza per prevenire attacchi Brute-Force
        this.failedAttempts = 0;
        this.lockoutUntil = 0;
        
        // Piano predefinito alla registrazione
        this.selectedPlan = 'novizio';
    }

    /**
     * Collega tutti gli Event Listener agli elementi dell'interfaccia (Bottoni, Form, Modali).
     */
    initEvents() {
        // ==========================================
        // 1. GESTIONE MODALE AUTH E LANDING PAGE
        // ==========================================
        const authModal = document.getElementById("auth-modal");
        const closeAuthModalBtn = document.getElementById("closeAuthModalBtn");

        // Apertura modale dai bottoni della Landing Page
        document.getElementById("navLoginBtn")?.addEventListener("click", () => this.openModal('login'));
        document.getElementById("navRegisterBtn")?.addEventListener("click", () => { 
            this.selectedPlan = 'novizio'; 
            this.openModal('register'); 
        });
        document.getElementById("heroCtaBtn")?.addEventListener("click", () => { 
            this.selectedPlan = 'novizio'; 
            this.openModal('register'); 
        });

        // Scelta di un piano specifico dalla tabella prezzi
        document.getElementById("btnPlanFree")?.addEventListener("click", () => {
            this.selectedPlan = 'novizio';
            this.openModal('register');
        });
        document.getElementById("btnPlanPro")?.addEventListener("click", () => {
            this.selectedPlan = 'guru';
            this.openModal('register');
        });

        // Chiusura della modale Auth
        closeAuthModalBtn?.addEventListener("click", () => authModal.classList.add("hidden"));

        // Switch interno tra tab "Accedi" e "Registrati"
        document.getElementById("tabLogin")?.addEventListener("click", () => this.switchTab('login'));
        document.getElementById("tabRegister")?.addEventListener("click", () => this.switchTab('register'));

        // Toggle Rapido del Tema (Chiaro/Scuro) nella Landing Page
        document.getElementById("landingThemeToggle")?.addEventListener("click", () => {
            const body = document.body;
            const currentTheme = body.classList.contains('light') ? 'light' : 'dark';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

            body.classList.remove('dark', 'light');
            body.classList.add(newTheme);

            localStorage.setItem("appTheme", newTheme);

            if (typeof Utils !== 'undefined') Utils.fixThemeLegibility();
            if (this.app.plans) this.app.plans.updateUI();
        });

        // ==========================================
        // 2. UX E FEEDBACK VISIVO PASSWORD
        // ==========================================
        this.setupPasswordToggle("toggleLogPwd", "logPassword");
        this.setupPasswordToggle("toggleRegPwd", "regPassword");

        // Calcolo della forza della password in tempo reale
        document.getElementById("regPassword")?.addEventListener("input", (e) => this.updatePasswordMeter(e.target.value));

        // ==========================================
        // 3. SUBMIT DEI FORM AUTH
        // ==========================================
        document.getElementById("loginForm")?.addEventListener("submit", (e) => this.login(e));
        document.getElementById("registerForm")?.addEventListener("submit", (e) => this.register(e));

        // Placeholder per i bottoni Social Login (Non attivi senza Backend Cloud)
        const fakeSocial = () => {
            if (typeof Utils !== 'undefined') Utils.showToast("⚠️ Il Social Login richiede un database cloud attivo. Usa l'email per ora!");
        };
        document.getElementById("fakeGoogleBtn")?.addEventListener("click", fakeSocial);
        document.getElementById("fakeGithubBtn")?.addEventListener("click", fakeSocial);

        // ==========================================
        // 4. GESTIONE MODIFICA PROFILO UTENTE
        // ==========================================
        document.getElementById("openProfileEditBtn")?.addEventListener("click", () => {
            this.populateProfile();
            document.getElementById("profileModal").classList.remove("hidden");
        });

        document.getElementById("cancelProfileBtn")?.addEventListener("click", () => {
            document.getElementById("profileModal").classList.add("hidden");
        });

        document.getElementById("saveProfileBtn")?.addEventListener("click", () => {
            const u = this.app.loggedUser;
            const nuovoNome = document.getElementById("profNome").value.trim();
            const nuovoCognome = document.getElementById("profCognome").value.trim();
            const nuovaEmail = document.getElementById("profEmail").value.trim().toLowerCase();
            const nuovaPass = document.getElementById("profPassword").value;
            const confermaPass = document.getElementById("profPasswordConfirm").value;

            // Validazione campi obbligatori
            if (!nuovoNome || !nuovoCognome || !nuovaEmail) {
                if (typeof Utils !== 'undefined') Utils.showToast("⚠️ Nome, Cognome ed Email sono obbligatori!");
                return;
            }

            // Validazione formato Email tramite Regex
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(nuovaEmail)) {
                if (typeof Utils !== 'undefined') Utils.showToast("⚠️ Inserisci un indirizzo email valido!");
                return;
            }

            // Controllo email duplicata (ignora l'utente corrente)
            const emailExists = this.app.users.find(user => user.email === nuovaEmail && user.id !== u.id);
            if (emailExists) {
                if (typeof Utils !== 'undefined') Utils.showToast("❌ Questa email è già in uso da un altro account!");
                return;
            }

            // Validazione del cambio Password opzionale
            if (nuovaPass) {
                if (nuovaPass !== confermaPass) {
                    if (typeof Utils !== 'undefined') Utils.showToast("❌ Le password non coincidono!");
                    return;
                }
                if (nuovaPass.length < 8) {
                    if (typeof Utils !== 'undefined') Utils.showToast("⚠️ La password deve avere almeno 8 caratteri!");
                    return;
                }
                u.password = nuovaPass;
            }

            // Salvataggio effettivo dei nuovi dati
            u.nome = nuovoNome;
            u.cognome = nuovoCognome;
            u.email = nuovaEmail;

            this.app.saveUser();
            this.populateProfile();
            this.app.gamification.updateUI();

            document.getElementById("profileModal").classList.add("hidden");
            if (typeof Utils !== 'undefined') Utils.showToast("✅ Profilo aggiornato con successo!");

            // Pulizia input password per sicurezza
            document.getElementById("profPassword").value = "";
            document.getElementById("profPasswordConfirm").value = "";
        });
    }

    /**
     * Apre la modale di Autenticazione e si posiziona sulla scheda richiesta.
     * @param {string} mode - 'login' o 'register'
     */
    openModal(mode) {
        document.getElementById("auth-modal").classList.remove("hidden");
        this.switchTab(mode);
    }

    /**
     * Gestisce la transizione visiva e logica tra il form di Accesso e Registrazione.
     * Svuota i campi e resetta gli indicatori visivi per sicurezza.
     * @param {string} mode - 'login' o 'register'
     */
    switchTab(mode) {
        const isLogin = mode === 'login';

        // Aggiorna classi UI
        document.getElementById("tabLogin").classList.toggle("active", isLogin);
        document.getElementById("tabRegister").classList.toggle("active", !isLogin);
        document.getElementById("loginForm").classList.toggle("hidden", !isLogin);
        document.getElementById("registerForm").classList.toggle("hidden", isLogin);

        // Reset dei form per evitare rimasugli di testo
        const loginForm = document.getElementById("loginForm");
        const registerForm = document.getElementById("registerForm");
        if (loginForm) loginForm.reset();
        if (registerForm) registerForm.reset();

        // Riporta gli input password alla modalità censurata ("password")
        const pwdLog = document.getElementById("logPassword");
        const pwdReg = document.getElementById("regPassword");
        if (pwdLog) pwdLog.type = "password";
        if (pwdReg) pwdReg.type = "password";

        // Azzera la barra di sicurezza della password
        this.updatePasswordMeter("");
    }

    /**
     * Inietta i bottoni SVG per mostrare/nascondere la password in chiaro.
     * @param {string} btnId - ID del bottone (icona occhio).
     * @param {string} inputId - ID dell'input password da controllare.
     */
    setupPasswordToggle(btnId, inputId) {
        const btn = document.getElementById(btnId);
        const input = document.getElementById(inputId);
        if (!btn || !input) return;

        const eyeOpen = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
        const eyeClosed = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"></path></svg>`;

        btn.innerHTML = eyeOpen;

        btn.addEventListener("click", () => {
            const isText = input.type === "text";
            input.type = isText ? "password" : "text";
            btn.innerHTML = isText ? eyeOpen : eyeClosed;
        });
    }

    /**
     * Calcola e visualizza la robustezza della password inserita dall'utente.
     * @param {string} pwd - La password da valutare.
     */
    updatePasswordMeter(pwd) {
        const bar = document.getElementById("pwdStrengthBar");
        const text = document.getElementById("pwdStrengthText");
        if (!bar || !text) return;

        if (!pwd || pwd.length === 0) {
            bar.style.width = "0%";
            text.textContent = "Sicurezza: Troppo debole";
            text.style.color = "var(--text-3)";
            return;
        }

        // Sistema a Punteggio (Score)
        let score = 0;
        if (pwd.length >= 8) score += 25;
        if (pwd.length >= 12) score += 15;
        if (/[A-Z]/.test(pwd)) score += 20;
        if (/[a-z]/.test(pwd)) score += 10;
        if (/[0-9]/.test(pwd)) score += 20;
        if (/[^A-Za-z0-9]/.test(pwd)) score += 10;

        let color, label;
        if (score < 40) {
            color = "var(--badge-err-t)"; label = "Debole (Aggiungi numeri o maiuscole)"; bar.style.width = "30%";
        } else if (score < 75) {
            color = "var(--badge-warn-t)"; label = "Media (Puoi fare di meglio)"; bar.style.width = "60%";
        } else {
            color = "var(--badge-ok-t)"; label = "Forte (A prova di hacker!)"; bar.style.width = "100%";
        }

        bar.style.background = color;
        text.textContent = `Sicurezza: ${label}`;
        text.style.color = color;
    }

    /**
     * Gestisce la creazione di un nuovo account, i controlli di validazione
     * e l'inizializzazione del database locale (PWA Offline First).
     * @param {Event} e - Evento di submit del form.
     */
    register(e) {
        e.preventDefault();
        const nome = document.getElementById("regNome").value.trim();
        const cognome = document.getElementById("regCognome").value.trim();
        const email = document.getElementById("regEmail").value.trim().toLowerCase();
        const password = document.getElementById("regPassword").value;
        const terms = document.getElementById("acceptTerms").checked;

        if (!terms) {
            Utils.showToast("⚠️ Devi accettare i Termini e la Privacy Policy!");
            return;
        }

        if (password.length < 8) {
            Utils.showToast("⚠️ La password deve avere almeno 8 caratteri!");
            return;
        }

        const exists = this.app.users.find(u => u.email === email);
        if (exists) {
            Utils.showToast("❌ Questa email è già registrata! Prova ad accedere.");
            return;
        }

        // Creazione dell'oggetto Utente Strutturato
        const newUser = {
            id: "u_" + Date.now(),
            nome,
            cognome,
            email,
            password,
            plan: this.selectedPlan,
            theme: 'dark', 
            settings: {},  
            notes: [],
            folders: []
        };

        this.app.users.push(newUser);
        this.app.loggedUser = newUser;
        
        // Inizializzazione della Master Key per crittografia
        sessionStorage.setItem("zenith_master_key", password);
        this.app.masterKey = password;
        this.app.saveUser();
        
        // Gestione Sessione (Ricordami / Non Ricordami)
        const rememberMe = document.getElementById("regRememberMe").checked;
        if (rememberMe) {
            const sessionData = {
                userId: newUser.id,
                expiresAt: Date.now() + (14 * 24 * 60 * 60 * 1000) // +14 giorni
            };
            localStorage.setItem("zenith_session", JSON.stringify(sessionData));
        } else {
            sessionStorage.setItem("zenith_volatile_user", JSON.stringify(newUser));
        }

        Utils.showToast(`🎉 Benvenuto su Zenith, ${nome}!`);
        setTimeout(() => location.reload(), 1000);
    }

    /**
     * Gestisce l'accesso dell'utente, decripta i dati locali e integra 
     * un blocco di sicurezza (Lockout) contro attacchi Brute-Force.
     * @param {Event} e - Evento di submit del form.
     */
    login(e) {
        e.preventDefault();

        // Controllo Blocco Temporaneo (Lockout)
        if (Date.now() < this.lockoutUntil) {
            const secondiRimanenti = Math.ceil((this.lockoutUntil - Date.now()) / 1000);
            if (typeof Utils !== 'undefined') Utils.showToast(`🚨 Troppi tentativi. Riprova tra ${secondiRimanenti} secondi.`);
            return;
        }

        const emailInput = document.getElementById("logEmail").value.trim().toLowerCase();
        const password = document.getElementById("logPassword").value;

        // Ricerca stretta (Case Sensitive per Password)
        const user = this.app.users.find(u => u.email === emailInput && u.password === password);

        if (user) {
            this.failedAttempts = 0; // Azzera i tentativi falliti
            const rememberMe = document.getElementById("logRememberMe").checked;

            if (rememberMe) {
                const sessionData = {
                    userId: user.id,
                    expiresAt: Date.now() + (14 * 24 * 60 * 60 * 1000)
                };
                localStorage.setItem("zenith_session", JSON.stringify(sessionData));
            } else {
                sessionStorage.setItem("zenith_volatile_user", JSON.stringify(user));
            }

            this.app.loggedUser = user;
            
            // Fornisce la Master Key e decripta la cassaforte
            sessionStorage.setItem("zenith_master_key", password);
            this.app.unlockVault(password);
            this.app.saveUser();
            
            if (typeof Utils !== 'undefined') Utils.showToast(`Bentornato su Zenith, ${user.nome}! 🚀`);
            setTimeout(() => location.reload(), 500);
        } else {
            // Gestione Tentativi Falliti
            this.failedAttempts++;
            if (this.failedAttempts >= 3) {
                this.lockoutUntil = Date.now() + 30000; // Blocco di 30 secondi
                if (typeof Utils !== 'undefined') Utils.showToast("🚨 Account bloccato per 30 secondi per sicurezza.");
            } else {
                const tentativiRimasti = 3 - this.failedAttempts;
                if (typeof Utils !== 'undefined') Utils.showToast(`❌ Credenziali errate. Tentativi rimasti: ${tentativiRimasti}`);
            }
        }
    }

    /**
     * Placeholder per aggiornamenti visivi secondari, 
     * viene chiamato dal motore principale all'avvio.
     */
    updateUI() { 
        // Riservato per future implementazioni UI 
    }

    /**
     * Legge i dati dall'utente loggato e li riversa nei campi di testo 
     * della pagina del Profilo e all'interno della modale di modifica.
     */
    populateProfile() {
        if (!this.app.loggedUser) return;
        const u = this.app.loggedUser;

        // Dati in sola lettura nella pagina profilo
        if (document.getElementById("dispProfNome")) document.getElementById("dispProfNome").textContent = u.nome;
        if (document.getElementById("dispProfCognome")) document.getElementById("dispProfCognome").textContent = u.cognome;
        if (document.getElementById("dispProfEmail")) document.getElementById("dispProfEmail").textContent = u.email || "Non impostata";

        // Informazioni sul piano abbonamento
        if (document.getElementById("dispProfPlan")) {
            const planKey = u.plan || 'novizio';
            document.getElementById("dispProfPlan").textContent = planKey === 'guru' ? 'Piano Guru 👑' : 'Piano Novizio';
        }

        // Dati pre-compilati all'interno della modale di modifica
        if (document.getElementById("profNome")) document.getElementById("profNome").value = u.nome;
        if (document.getElementById("profCognome")) document.getElementById("profCognome").value = u.cognome;
        if (document.getElementById("profEmail")) document.getElementById("profEmail").value = u.email || "";
    }
}