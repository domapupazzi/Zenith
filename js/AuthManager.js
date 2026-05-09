/**
 * @class AuthManager
 * @description Gestisce la Landing Page, la modale di Login/Registrazione, 
 * la validazione dei dati e i sistemi di sicurezza (Password Meter e Lockout).
 */
class AuthManager {
    constructor(app) {
        this.app = app;

        // 🛡️ Variabili di Sicurezza
        this.failedAttempts = 0;
        this.lockoutUntil = 0;
        this.selectedPlan = 'novizio';
    }

    initEvents() {
        // --- 1. GESTIONE MODALE E LANDING PAGE ---
        const authModal = document.getElementById("auth-modal");
        const closeAuthModalBtn = document.getElementById("closeAuthModalBtn");

        // Apertura dai bottoni della Landing Page
        document.getElementById("navLoginBtn")?.addEventListener("click", () => this.openModal('login'));
        document.getElementById("navRegisterBtn")?.addEventListener("click", () => { this.selectedPlan = 'novizio'; this.openModal('register'); });
        document.getElementById("heroCtaBtn")?.addEventListener("click", () => { this.selectedPlan = 'novizio'; this.openModal('register'); });

        // 🟢 Scelta Piani Specifici
        document.getElementById("btnPlanFree")?.addEventListener("click", () => {
            this.selectedPlan = 'novizio';
            this.openModal('register');
        });
        document.getElementById("btnPlanPro")?.addEventListener("click", () => {
            this.selectedPlan = 'guru';
            this.openModal('register');
        });


        // Chiusura Modale
        closeAuthModalBtn?.addEventListener("click", () => authModal.classList.add("hidden"));

        // Switch tra tab "Accedi" e "Registrati"
        document.getElementById("tabLogin")?.addEventListener("click", () => this.switchTab('login'));
        document.getElementById("tabRegister")?.addEventListener("click", () => this.switchTab('register'));

        // Toggle Tema Rapido nella Landing Page
        document.getElementById("landingThemeToggle")?.addEventListener("click", () => {
            const body = document.body;
            const currentTheme = body.classList.contains('light') ? 'light' : 'dark';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

            // Pulisce tutte le classi tema e applica la nuova
            body.classList.remove('dark', 'light');
            body.classList.add(newTheme);

            // 🟢 SALVATAGGIO: Fondamentale perché ZenithEngine lo legga al riavvio
            localStorage.setItem("appTheme", newTheme);

            // Aggiorna contrasti e UI
            if (typeof Utils !== 'undefined') Utils.fixThemeLegibility();
            if (this.app.plans) this.app.plans.updateUI();
        });

        // --- 2. UX E FEEDBACK VISIVO ---
        // Mostra/Nascondi Password (con SVG Professionali)
        this.setupPasswordToggle("toggleLogPwd", "logPassword");
        this.setupPasswordToggle("toggleRegPwd", "regPassword");

        // Misuratore Forza Password (Real-Time)
        document.getElementById("regPassword")?.addEventListener("input", (e) => this.updatePasswordMeter(e.target.value));

        // --- 3. SUBMIT DEI FORM ---
        document.getElementById("loginForm")?.addEventListener("submit", (e) => this.login(e));
        document.getElementById("registerForm")?.addEventListener("submit", (e) => this.register(e));

        // Social Login Placeholder
        const fakeSocial = () => {
            if (typeof Utils !== 'undefined') Utils.showToast("⚠️ Il Social Login richiede un database cloud attivo. Usa l'email per ora!");
        };
        document.getElementById("fakeGoogleBtn")?.addEventListener("click", fakeSocial);
        document.getElementById("fakeGithubBtn")?.addEventListener("click", fakeSocial);
        // --- 4. GESTIONE SCHERMATA PROFILO ---
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

            // 1. Controllo campi vuoti
            if (!nuovoNome || !nuovoCognome || !nuovaEmail) {
                if (typeof Utils !== 'undefined') Utils.showToast("⚠️ Nome, Cognome ed Email sono obbligatori!");
                return;
            }

            // 🟢 NUOVO: 2. Validazione Formato Email
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(nuovaEmail)) {
                if (typeof Utils !== 'undefined') Utils.showToast("⚠️ Inserisci un indirizzo email valido!");
                return;
            }

            // 🟢 NUOVO: 3. Controllo Duplicati (Esclude l'utente stesso)
            // Cerca se esiste un utente con la stessa email, ma che NON abbia il nostro stesso ID
            const emailExists = this.app.users.find(user => user.email === nuovaEmail && user.id !== u.id);
            if (emailExists) {
                if (typeof Utils !== 'undefined') Utils.showToast("❌ Questa email è già in uso da un altro account!");
                return;
            }

            // 4. Validazione Cambio Password
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

            // Aggiorna i dati utente in RAM
            u.nome = nuovoNome;
            u.cognome = nuovoCognome;
            u.email = nuovaEmail;

            // Salva e Sincronizza tutta l'UI
            this.app.saveUser();
            this.populateProfile();
            this.app.gamification.updateUI();

            document.getElementById("profileModal").classList.add("hidden");
            if (typeof Utils !== 'undefined') Utils.showToast("✅ Profilo aggiornato con successo!");

            // Pulisce i campi password per la prossima volta
            document.getElementById("profPassword").value = "";
            document.getElementById("profPasswordConfirm").value = "";
        });
    }

    /** 🟢 Apre la modale nella scheda corretta */
    openModal(mode) {
        document.getElementById("auth-modal").classList.remove("hidden");
        this.switchTab(mode);
    }

    /** 🟢 Alterna i form Login/Register e Pulisce i campi inattivi */
    switchTab(mode) {
        const isLogin = mode === 'login';

        // Cambio visuale dei tab
        document.getElementById("tabLogin").classList.toggle("active", isLogin);
        document.getElementById("tabRegister").classList.toggle("active", !isLogin);
        document.getElementById("loginForm").classList.toggle("hidden", !isLogin);
        document.getElementById("registerForm").classList.toggle("hidden", isLogin);

        // 🧹 Svuota i form per sicurezza (UX Migliorata)
        const loginForm = document.getElementById("loginForm");
        const registerForm = document.getElementById("registerForm");
        if (loginForm) loginForm.reset();
        if (registerForm) registerForm.reset();

        // Resetta i campi password a modalità invisibile e resetta le icone
        const pwdLog = document.getElementById("logPassword");
        const pwdReg = document.getElementById("regPassword");
        if (pwdLog) pwdLog.type = "password";
        if (pwdReg) pwdReg.type = "password";

        // Resetta anche il contatore della sicurezza
        this.updatePasswordMeter("");
    }

    /** 🟢 Logica icona Occhio (SVG) per vedere la password */
    setupPasswordToggle(btnId, inputId) {
        const btn = document.getElementById(btnId);
        const input = document.getElementById(inputId);
        if (!btn || !input) return;

        // SVG professionali stile "Feather Icons"
        const eyeOpen = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
        const eyeClosed = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"></path></svg>`;

        // Imposta l'icona di default
        btn.innerHTML = eyeOpen;

        btn.addEventListener("click", () => {
            const isText = input.type === "text";
            input.type = isText ? "password" : "text";
            // Cambia elegantemente l'icona
            btn.innerHTML = isText ? eyeOpen : eyeClosed;
        });
    }

    /** 🛡️ Calcola matematicamente la forza della password */
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

        // Calcolo Punteggio
        let score = 0;
        if (pwd.length >= 8) score += 25;
        if (pwd.length >= 12) score += 15;
        if (/[A-Z]/.test(pwd)) score += 20;
        if (/[a-z]/.test(pwd)) score += 10;
        if (/[0-9]/.test(pwd)) score += 20;
        if (/[^A-Za-z0-9]/.test(pwd)) score += 10;

        // Aggiornamento Grafica
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

    /** 🟢 Processo di Registrazione Pro */
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

        const newUser = {
            id: "u_" + Date.now(),
            nome,
            cognome,
            email,
            password,
            plan: this.selectedPlan,
            theme: 'dark', // 🟢 Tema di default per l'account
            settings: {},  // 🟢 Impostazioni personali (font, dimensioni, ecc.)
            notes: [],
            folders: []
        };

        this.app.users.push(newUser);
        this.app.loggedUser = newUser;
        // Imposta la chiave per il primo salvataggio criptato
        sessionStorage.setItem("zenith_master_key", password);
        this.app.masterKey = password;
        this.app.saveUser();
        const rememberMe = document.getElementById("regRememberMe").checked;

        if (rememberMe) {
            // Sessione lunga: salviamo nel LocalStorage con una data di scadenza
            const sessionData = {
                userId: newUser.id,
                expiresAt: Date.now() + (14 * 24 * 60 * 60 * 1000) // +14 giorni
            };
            localStorage.setItem("zenith_session", JSON.stringify(sessionData));
        } else {
            // Sessione volatile: salviamo nel SessionStorage
            sessionStorage.setItem("zenith_volatile_user", JSON.stringify(newUser));
        }

        Utils.showToast(`🎉 Benvenuto su Zenith, ${nome}!`);
        setTimeout(() => location.reload(), 1000);
    }

    /** 🛡️ Processo di Login con Protezione Brute-Force */
    login(e) {
        e.preventDefault();

        if (Date.now() < this.lockoutUntil) {
            const secondiRimanenti = Math.ceil((this.lockoutUntil - Date.now()) / 1000);
            if (typeof Utils !== 'undefined') Utils.showToast(`🚨 Troppi tentativi. Riprova tra ${secondiRimanenti} secondi.`);
            return;
        }

        const emailInput = document.getElementById("logEmail").value.trim().toLowerCase();
        const password = document.getElementById("logPassword").value;

        // 🟢 FIX: Ora cerca l'utente strettamente per EMAIL e PASSWORD
        const user = this.app.users.find(u => u.email === emailInput && u.password === password);

        if (user) {
            this.failedAttempts = 0;
            const rememberMe = document.getElementById("logRememberMe").checked;

            if (rememberMe) {
                // Sessione lunga: salviamo nel LocalStorage con una data di scadenza
                const sessionData = {
                    userId: user.id,
                    expiresAt: Date.now() + (14 * 24 * 60 * 60 * 1000) // +14 giorni
                };
                localStorage.setItem("zenith_session", JSON.stringify(sessionData));
            } else {
                // Sessione volatile: salviamo nel SessionStorage
                sessionStorage.setItem("zenith_volatile_user", JSON.stringify(user));
            }

            this.app.loggedUser = user;
            // Sblocca la cassaforte con la password appena inserita
            sessionStorage.setItem("zenith_master_key", password);
            this.app.unlockVault(password);
            this.app.saveUser();
            if (typeof Utils !== 'undefined') Utils.showToast(`Bentornato su Zenith, ${user.nome}! 🚀`);
            setTimeout(() => location.reload(), 500);
        } else {
            this.failedAttempts++;
            if (this.failedAttempts >= 3) {
                this.lockoutUntil = Date.now() + 30000;
                if (typeof Utils !== 'undefined') Utils.showToast("🚨 Account bloccato per 30 secondi per sicurezza.");
            } else {
                const tentativiRimasti = 3 - this.failedAttempts;
                if (typeof Utils !== 'undefined') Utils.showToast(`❌ Credenziali errate. Tentativi rimasti: ${tentativiRimasti}`);
            }
        }
    }

    updateUI() { }

    populateProfile() {
        if (!this.app.loggedUser) return;
        const u = this.app.loggedUser;

        // Popola la vista della tab "Dati Personali"
        if (document.getElementById("dispProfNome")) document.getElementById("dispProfNome").textContent = u.nome;
        if (document.getElementById("dispProfCognome")) document.getElementById("dispProfCognome").textContent = u.cognome;
        if (document.getElementById("dispProfEmail")) document.getElementById("dispProfEmail").textContent = u.email || "Non impostata";

        // 🟢 Mostra il piano nel profilo
        if (document.getElementById("dispProfPlan")) {
            const planKey = u.plan || 'novizio';
            document.getElementById("dispProfPlan").textContent = planKey === 'guru' ? 'Piano Guru 👑' : 'Piano Novizio';
        }

        // Pre-compila gli input della modale di modifica
        if (document.getElementById("profNome")) document.getElementById("profNome").value = u.nome;
        if (document.getElementById("profCognome")) document.getElementById("profCognome").value = u.cognome;
        if (document.getElementById("profEmail")) document.getElementById("profEmail").value = u.email || "";
    }
}