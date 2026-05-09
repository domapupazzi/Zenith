/**
 * @class ExportManager
 * @description Gestisce l'esportazione dei dati delle singole note. 
 * Converte le note in file testuali grezzi (Markdown) o in documenti impaginati
 * pronti per la stampa (PDF) sfruttando la libreria esterna html2pdf.js.
 */
class ExportManager {
    /**
     * Inizializza il manager dell'esportazione.
     * @param {Object} app - L'istanza principale dell'applicazione (ZenithEngine).
     */
    constructor(app) {
        this.app = app;
    }

    /**
     * Inizializza gli ascoltatori di eventi, in particolare l'apertura del
     * menu a tendina dinamico quando si clicca il tasto "Esporta" dentro la modale della nota.
     */
    initEvents() {
        const exportBtn = document.getElementById("exportNoteBtn");
        if (exportBtn) {
            exportBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation(); // Evita che il click si propaghi chiudendo altri elementi
                this.showExportMenu(e);
            });
        }
    }

    /**
     * Genera un menu contestuale a tendina (Popup Menu) vicino alla posizione del cursore.
     * Permette di scegliere il formato di esportazione.
     * @param {MouseEvent} event - L'evento click del mouse.
     */
    showExportMenu(event) {
        // Controllo di sicurezza: serve una nota attiva per esportarla
        if (!this.app.notes.currentNoteId) {
            if (typeof Utils !== 'undefined') Utils.showToast("Nessuna nota selezionata!");
            return;
        }

        // Rimuove eventuali menu rimasti aperti da click precedenti
        const existingMenu = document.getElementById("export-mini-menu");
        if (existingMenu) existingMenu.remove();

        // Creazione dinamica (DOM manipulation) del menu a tendina
        const menu = document.createElement("div");
        menu.id = "export-mini-menu";
        
        // Stile inline per garantire l'isolamento visuale e il corretto posizionamento
        menu.style.cssText = `
            position: fixed;
            top: ${event.clientY + 15}px;
            left: ${event.clientX - 100}px;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 8px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            z-index: 10000;
            display: flex;
            flex-direction: column;
            padding: 5px;
            min-width: 180px;
            animation: fadeIn 0.2s ease;
        `;

        // ==========================================
        // CREAZIONE BOTTONE: ESPORTA IN PDF
        // ==========================================
        const btnPdf = document.createElement("button");
        btnPdf.className = "btn-text";
        btnPdf.style.cssText = "padding: 10px 15px; text-align: left; color: var(--text-1); border-radius: 5px; width: 100%; transition: background 0.2s;";
        btnPdf.innerHTML = "📄 Esporta in PDF";
        
        // Hover effects manuali
        btnPdf.onmouseover = () => btnPdf.style.background = "var(--bg-hover)";
        btnPdf.onmouseout = () => btnPdf.style.background = "transparent";
        
        // Azione al click
        btnPdf.onclick = () => { 
            this.exportCurrentToPDF(); 
            menu.remove(); 
        };

        // ==========================================
        // CREAZIONE BOTTONE: ESPORTA IN MARKDOWN
        // ==========================================
        const btnMd = document.createElement("button");
        btnMd.className = "btn-text";
        btnMd.style.cssText = "padding: 10px 15px; text-align: left; color: var(--text-1); border-radius: 5px; width: 100%; transition: background 0.2s;";
        btnMd.innerHTML = "📝 Esporta in Markdown";
        
        // Hover effects manuali
        btnMd.onmouseover = () => btnMd.style.background = "var(--bg-hover)";
        btnMd.onmouseout = () => btnMd.style.background = "transparent";
        
        // Azione al click
        btnMd.onclick = () => { 
            this.exportCurrentToMD(); 
            menu.remove(); 
        };

        // Inserimento elementi nel DOM
        menu.appendChild(btnPdf);
        menu.appendChild(btnMd);
        document.body.appendChild(menu);

        // Sistema di auto-chiusura: Chiude il menu se l'utente clicca fuori dal suo perimetro
        setTimeout(() => {
            const closeMenu = (e) => {
                if (!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener("click", closeMenu);
                }
            };
            document.addEventListener("click", closeMenu);
        }, 10);
    }

    /**
     * Helper logico: Recupera l'oggetto dati della nota attualmente in fase di visualizzazione/modifica.
     * @returns {Object|undefined} L'oggetto nota o undefined se non trovata.
     */
    getNote() {
        const id = this.app.notes.currentNoteId;
        return this.app.loggedUser.notes.find(n => n.id === id);
    }

    /**
     * Processa la nota corrente e ne crea un file testuale (.md) utilizzando
     * la sintassi nativa Markdown, conservando titolo, corpo, e metadati (opzionali).
     */
    exportCurrentToMD() {
        const note = this.getNote();
        if (!note) return;

        let mdContent = `# ${note.title}\n\n`;
        
        // 1. Inserimento Metadati Condizionali (selezionati dall'utente)
        if (document.getElementById("exportIncludeDate")?.checked) {
            const dateStr = note.dueDate ? new Date(note.dueDate).toLocaleString('it-IT') : new Date().toLocaleString('it-IT');
            mdContent += `> **Scadenza/Data:** ${dateStr}\n>\n`;
        }
        
        if (document.getElementById("exportIncludeTags")?.checked && note.tags && note.tags.length > 0) {
            mdContent += `> **Tags:** ${note.tags.map(t => '#' + t).join(', ')}\n\n`;
        }

        // 2. Inserimento Contenuto principale
        mdContent += `---\n\n`;
        mdContent += note.description || "Nessun contenuto in questa nota.";

        // 3. Generazione e Download del file
        const blob = new Blob([mdContent], { type: "text/markdown;charset=utf-8" });
        
        // Formatta il nome file rimuovendo spazi e caratteri speciali
        const safeFilename = `${note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
        this.downloadBlob(blob, safeFilename);
        
        if (typeof Utils !== 'undefined') Utils.showToast("📝 File Markdown scaricato!");
    }

    /**
     * Processa la nota corrente assemblando un documento HTML temporaneo (invisibile)
     * e utilizza html2pdf.js per stampare tale struttura in un documento vettoriale PDF.
     */
    exportCurrentToPDF() {
        const note = this.getNote();
        if (!note) return;

        // Controllo di esistenza per la libreria esterna
        if (typeof html2pdf === 'undefined') {
            if (typeof Utils !== 'undefined') Utils.showToast("❌ Errore: Libreria PDF non caricata.");
            return;
        }

        if (typeof Utils !== 'undefined') Utils.showToast("⏳ Generazione PDF in corso...");

        // ==========================================
        // 1. PREPARAZIONE DEL CONTENITORE STAMPA
        // ==========================================
        const printContainer = document.createElement("div");
        printContainer.style.padding = "30px";
        printContainer.style.fontFamily = this.app.settings.fontFamily || 'sans-serif';
        printContainer.style.color = "#000000";       // Colore forzato per evitare PDF scuri
        printContainer.style.background = "#ffffff";  // Sfondo bianco obbligatorio
        printContainer.style.width = "100%"; 
        printContainer.style.boxSizing = "border-box";

        // ==========================================
        // 2. HEADER: TITOLO E BADGE PRIORITÀ
        // ==========================================
        const prioColor = note.priority === 'alta' ? '#e74c3c' : (note.priority === 'media' ? '#f1c40f' : '#2ecc71');
        const prioLabel = note.priority ? note.priority.toUpperCase() : 'BASSA';

        // Utilizzo del layout CSS Table per evitare che il badge sbordi durante la stampa PDF
        let html = `
            <div style="border-bottom: 2px solid #ccc; padding-bottom: 15px; margin-bottom: 20px; width: 100%; display: table;">
                <div style="display: table-cell; width: 80%; vertical-align: middle;">
                    <h1 style="margin: 0; font-size: 26px; word-wrap: break-word;">
                        ${note.title}
                    </h1>
                </div>
                <div style="display: table-cell; width: 20%; vertical-align: middle; text-align: right;">
                    <span style="background: ${prioColor}; color: white; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: bold; white-space: nowrap;">
                        ${prioLabel}
                    </span>
                </div>
            </div>
        `;

        // ==========================================
        // 3. METADATI: DATE E TAGS
        // ==========================================
        if (document.getElementById("exportIncludeDate")?.checked) {
            if (note.dueDate) {
                const dateStr = new Date(note.dueDate).toLocaleString('it-IT');
                html += `<p style="color: #666; font-size: 12px; margin-bottom: 5px;">📅 <strong>Data di Scadenza:</strong> ${dateStr}</p>`;
            } else {
                const dateStr = new Date().toLocaleString('it-IT');
                html += `<p style="color: #999; font-size: 11px; margin-bottom: 5px;">📄 Data Esportazione: ${dateStr}</p>`;
            }
        }
        
        if (document.getElementById("exportIncludeTags")?.checked && note.tags && note.tags.length > 0) {
            html += `<p style="color: #666; font-size: 12px; margin-bottom: 20px;">🏷️ <strong>Etichette:</strong> ${note.tags.map(t => '#' + t).join(', ')}</p>`;
        }

        // ==========================================
        // 4. CORPO DELLA NOTA
        // ==========================================
        const parsedBody = Utils.parseMarkdown(note.description || "*Nessun contenuto.*");
        
        // Regex per rimuovere eventuali bottoni interattivi (inutili in stampa)
        const cleanBody = parsedBody.replace(/<button[^>]*>.*?<\/button>/g, '');
        
        html += `<div style="margin-top: 25px; line-height: 1.8; font-size: 14px; word-wrap: break-word;">${cleanBody}</div>`;
        printContainer.innerHTML = html;

        // ==========================================
        // 5. IMPOSTAZIONI E COMPILAZIONE HTML2PDF
        // ==========================================
        const opt = {
            margin:       15, // Margini in millimetri
            filename:     `${note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#ffffff' }, // Risoluzione 2x per nitidezza
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        // Esecuzione promise e notifica di successo
        html2pdf().set(opt).from(printContainer).save().then(() => {
            if (typeof Utils !== 'undefined') Utils.showToast("✅ PDF generato e scaricato!");
        });
    }

    /**
     * Funzione Helper per forzare il download di un oggetto Blob nel browser.
     * @param {Blob} blob - Il pacchetto di dati da scaricare.
     * @param {string} filename - Il nome da assegnare al file scaricato.
     */
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        
        // Simula un click fisico dell'utente
        a.click();
        
        // Pulizia della memoria
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}