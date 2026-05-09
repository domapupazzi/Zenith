/**
 * @class Utils
 * @description Classe statica che contiene funzioni di supporto riutilizzabili in tutta l'applicazione.
 * Non necessita di essere istanziata (si usa richiamando direttamente Utils.nomeFunzione).
 */
class Utils {
    
    /**
     * Converte il testo formattato in Markdown in HTML puro per la visualizzazione.
     * Supporta grassetto, corsivo, codice inline, liste di task (checkbox) e link bidirezionali.
     * @param {string} text - Il testo grezzo inserito dall'utente.
     * @returns {string} Stringa HTML formattata pronta per il DOM.
     */
    static parseMarkdown(text) {
        if (!text) return "";
        let html = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        
        // --- 1. ESTRAZIONE E PROTEZIONE DEL CODICE ---
        const inlineCodes = [];
        html = html.replace(/`([^`\n]+)`/g, (match, code) => {
            inlineCodes.push(code);
            return `___INLINECODE_${inlineCodes.length - 1}___`; // Segnaposto temporaneo
        });

        // --- 2. FORMATTAZIONE DEL TESTO NORMALE ---
        // Link Bidirezionali (Wiki-Links)
        html = html.replace(/\[\[(.*?)\]\]/g, (match, title) => {
            const cleanTitle = title.trim();
            return `<a href="#" class="md-link" onclick="event.preventDefault(); app.notes.openModalByTitle('${cleanTitle.replace(/'/g, "\\'")}')">${cleanTitle}</a>`;
        });

        // Grassetto e Corsivo
        html = html.replace(/\*\*(?=\S)([^\*]+?\S)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(?=\S)([^\*]+?\S)\*/g, '<em>$1</em>');
        
        // Liste di Task (Checkbox)
        html = html.replace(/\[x\]\s(.*)/g, '<label><input type="checkbox" class="md-checkbox" checked disabled> $1</label><br>');
        html = html.replace(/\[\s\]\s(.*)/g, '<label><input type="checkbox" class="md-checkbox" disabled> $1</label><br>');
        
        // Ritorni a capo (applicati solo al testo, non al codice protetto)
        html = html.replace(/\n/g, '<br>');

        // --- 3. REINSERIMENTO DEL CODICE PROTETTO ---
        html = html.replace(/___INLINECODE_(\d+)___/g, (match, index) => {
            return `<span class="md-code">${inlineCodes[index]}</span>`;
        });

        return html;
    }

    /**
     * Converte un file immagine caricato dall'utente in una stringa Base64.
     * @param {File} file - Il file immagine nativo letto dal browser.
     * @returns {Promise<string>} Promessa che si risolve con la stringa Base64 dell'immagine.
     */
    static getImageBase64(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });
    }

    /**
     * Mostra un messaggio di notifica "toast" temporaneo in basso a destra.
     * Scompare automaticamente dopo 3 secondi.
     * @param {string} msg - Il messaggio testuale da mostrare all'utente.
     */
    static showToast(msg) {
        const t = document.getElementById("toast");
        t.textContent = msg; 
        t.classList.add("show");
        setTimeout(() => t.classList.remove("show"), 3000);
    }

    /**
     * Mostra la schermata di caricamento a schermo intero (loader) e la nasconde 
     * in automatico dopo 600 millisecondi, eseguendo un'eventuale funzione alla fine.
     * @param {Function} [cb] - Funzione di callback opzionale da eseguire a transizione terminata.
     */
    static showLoader(cb) {
        const loader = document.getElementById("loader");
        loader.classList.add("visible");
        setTimeout(() => { 
            loader.classList.remove("visible"); 
            if (cb) cb(); 
        }, 600);
    }

    /**
     * Evidenzia le parole cercate all'interno di una stringa HTML,
     * ignorando intelligentemente il testo all'interno dei tag <HTML>.
     * @param {string} html - La stringa in cui cercare.
     * @param {string} keyword - La parola chiave da evidenziare.
     * @returns {string} L'HTML elaborato con i tag <mark> applicati.
     */
    static highlightText(html, keyword) {
        if (!keyword || !html) return html;
        const safeKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?![^<]*>)(${safeKeyword})`, "gi");
        return html.replace(regex, '<mark style="background-color: #ffeb3b; color: #000; padding: 0 2px; border-radius: 3px; font-weight: bold;">$1</mark>');
    }

    /**
     * Auto-Contrast Engine (WCAG v2)
     * Controlla la leggibilità della pagina e dei pulsanti in tempo reale.
     * Calcola la luminosità del tema corrente usando le formule WCAG e inverte
     * automaticamente i colori del testo se non c'è abbastanza contrasto con lo sfondo.
     */
    static fixThemeLegibility() {
        const root = document.body;
        const style = getComputedStyle(root);
        
        // 1. Reset fix precedenti
        root.style.removeProperty('--text-1');
        root.style.removeProperty('--text-2');
        root.style.removeProperty('--text-3');
        root.style.removeProperty('--text-on-accent');

        // 2. Lettura dei 3 colori chiave dal CSS
        const bg = style.getPropertyValue('--bg-card').trim();
        const text = style.getPropertyValue('--text-1').trim();
        const accent = style.getPropertyValue('--accent').trim();

        if (!bg.startsWith('#') || !text.startsWith('#') || !accent.startsWith('#')) return;

        // 3. Calcolo Luminosità (Formula WCAG)
        const getLuminance = (hex) => {
            let c = hex.substring(1);
            if(c.length === 3) c = c.split('').map(x => x + x).join('');
            let rgb = [parseInt(c.substr(0,2),16), parseInt(c.substr(2,2),16), parseInt(c.substr(4,2),16)].map(v => {
                v /= 255;
                return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
        };

        const getContrast = (lum1, lum2) => {
            const lightest = Math.max(lum1, lum2);
            const darkest = Math.min(lum1, lum2);
            return (lightest + 0.05) / (darkest + 0.05);
        };

        const lumBg = getLuminance(bg);
        const lumText = getLuminance(text);
        const lumAccent = getLuminance(accent);
        const lumWhite = getLuminance('#ffffff');

        // --- AZIONE 1: Fix Testo Normale su Sfondo Card ---
        if (getContrast(lumBg, lumText) < 4.5) {
            if (lumBg > 0.5) {
                // Sfondo chiaro -> Testi scuri
                root.style.setProperty('--text-1', '#1a1a1a');
                root.style.setProperty('--text-2', '#4a4a4a');
                root.style.setProperty('--text-3', '#666666');
            } else {
                // Sfondo scuro -> Testi chiari
                root.style.setProperty('--text-1', '#fdfdfd');
                root.style.setProperty('--text-2', '#cccccc');
                root.style.setProperty('--text-3', '#999999');
            }
        }

        // --- AZIONE 2: Fix Testo Pulsanti su Sfondo Accento ---
        if (getContrast(lumAccent, lumWhite) < 3.0) {
            root.style.setProperty('--text-on-accent', '#000000'); // Contrasto insufficiente col bianco, usa il nero
        } else {
            root.style.setProperty('--text-on-accent', '#ffffff'); // Resta bianco
        }
    }

    /**
     * Cripta una stringa di testo usando lo standard industriale AES-256.
     * @param {string} text - Il testo in chiaro (es. il JSON delle note).
     * @param {string} password - La Master Password dell'utente.
     * @returns {string|null} La stringa incomprensibile (Ciphertext) pronta da salvare, o null se fallisce.
     */
    static encrypt(text, password) {
        if (!text || !password) return null;
        try {
            return CryptoJS.AES.encrypt(text, password).toString();
        } catch (error) {
            console.error("Errore durante la crittografia:", error);
            return null;
        }
    }

    /**
     * Decripta una stringa AES-256 riportandola in chiaro.
     * @param {string} cipherText - La stringa criptata archiviata in memoria.
     * @param {string} password - La Master Password inserita dall'utente.
     * @returns {string|null} Il testo in chiaro, o null se la password è errata o i dati sono corrotti.
     */
    static decrypt(cipherText, password) {
        if (!cipherText || !password) return null;
        try {
            const bytes = CryptoJS.AES.decrypt(cipherText, password);
            const decryptedText = bytes.toString(CryptoJS.enc.Utf8);
            
            if (!decryptedText) return null;
            
            return decryptedText;
        } catch (error) {
            console.error("Errore durante la decrittografia (Password errata o dati corrotti):", error);
            return null;
        }
    }
}