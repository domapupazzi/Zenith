/**
 * @class ExportManager
 * @description Gestisce l'esportazione dei dati. Converte le note in formati testuali (Markdown)
 * e in documenti pronti per la stampa (PDF) utilizzando la libreria html2pdf.js.
 */
class ExportManager {
    constructor(app) {
        this.app = app;
    }

    initEvents() {
        // Intercetta il click sul nuovo bottone nella modale
        const exportBtn = document.getElementById("exportNoteBtn");
        if (exportBtn) {
            exportBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showExportMenu(e);
            });
        }
    }

    /**
     * Genera un piccolo menu a comparsa vicino al mouse per far scegliere il formato.
     */
    showExportMenu(event) {
        if (!this.app.notes.currentNoteId) {
            if (typeof Utils !== 'undefined') Utils.showToast("Nessuna nota selezionata!");
            return;
        }

        // Rimuove eventuali menu rimasti aperti
        const existingMenu = document.getElementById("export-mini-menu");
        if (existingMenu) existingMenu.remove();

        // Crea il menu a tendina dinamicamente
        const menu = document.createElement("div");
        menu.id = "export-mini-menu";
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

        // Bottone PDF
        const btnPdf = document.createElement("button");
        btnPdf.className = "btn-text";
        btnPdf.style.cssText = "padding: 10px 15px; text-align: left; color: var(--text-1); border-radius: 5px; width: 100%; transition: background 0.2s;";
        btnPdf.innerHTML = "📄 Esporta in PDF";
        btnPdf.onmouseover = () => btnPdf.style.background = "var(--bg-hover)";
        btnPdf.onmouseout = () => btnPdf.style.background = "transparent";
        btnPdf.onclick = () => { this.exportCurrentToPDF(); menu.remove(); };

        // Bottone Markdown
        const btnMd = document.createElement("button");
        btnMd.className = "btn-text";
        btnMd.style.cssText = "padding: 10px 15px; text-align: left; color: var(--text-1); border-radius: 5px; width: 100%; transition: background 0.2s;";
        btnMd.innerHTML = "📝 Esporta in Markdown";
        btnMd.onmouseover = () => btnMd.style.background = "var(--bg-hover)";
        btnMd.onmouseout = () => btnMd.style.background = "transparent";
        btnMd.onclick = () => { this.exportCurrentToMD(); menu.remove(); };

        menu.appendChild(btnPdf);
        menu.appendChild(btnMd);
        document.body.appendChild(menu);

        // Chiude il menu se si clicca fuori
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
     * Recupera l'oggetto della nota correntemente aperta
     */
    getNote() {
        const id = this.app.notes.currentNoteId;
        return this.app.loggedUser.notes.find(n => n.id === id);
    }

    /**
     * 📝 Esporta la nota in puro formato Markdown (.md)
     */
    exportCurrentToMD() {
        const note = this.getNote();
        if (!note) return;

        let mdContent = `# ${note.title}\n\n`;
        
        // Aggiunge metadati se scelti nelle impostazioni
        if (document.getElementById("exportIncludeDate")?.checked) {
            const dateStr = note.dueDate ? new Date(note.dueDate).toLocaleString('it-IT') : new Date().toLocaleString('it-IT');
            mdContent += `> **Scadenza/Data:** ${dateStr}\n>\n`;
        }
        if (document.getElementById("exportIncludeTags")?.checked && note.tags && note.tags.length > 0) {
            mdContent += `> **Tags:** ${note.tags.map(t => '#' + t).join(', ')}\n\n`;
        }

        mdContent += `---\n\n`;
        mdContent += note.description || "Nessun contenuto in questa nota.";

        const blob = new Blob([mdContent], { type: "text/markdown;charset=utf-8" });
        this.downloadBlob(blob, `${note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`);
        
        if (typeof Utils !== 'undefined') Utils.showToast("📝 File Markdown scaricato!");
    }

    /**
     * 📄 Esporta la nota impaginata come PDF per la stampa
     */
    /**
     * 📄 Esporta la nota impaginata come PDF per la stampa
     */
    exportCurrentToPDF() {
        const note = this.getNote();
        if (!note) return;

        if (typeof html2pdf === 'undefined') {
            if (typeof Utils !== 'undefined') Utils.showToast("❌ Errore: Libreria PDF non caricata.");
            return;
        }

        if (typeof Utils !== 'undefined') Utils.showToast("⏳ Generazione PDF in corso...");

        // Crea un contenitore temporaneo. Usiamo width: 100% invece dei pixel fissi
        const printContainer = document.createElement("div");
        printContainer.style.padding = "30px";
        printContainer.style.fontFamily = this.app.settings.fontFamily || 'sans-serif';
        printContainer.style.color = "#000000";
        printContainer.style.background = "#ffffff";
        printContainer.style.width = "100%"; 
        printContainer.style.boxSizing = "border-box";

        // --- 1. HEADER CON TITOLO E PRIORITÀ ---
        const prioColor = note.priority === 'alta' ? '#e74c3c' : (note.priority === 'media' ? '#f1c40f' : '#2ecc71');
        const prioLabel = note.priority ? note.priority.toUpperCase() : 'BASSA';

        // 🟢 FIX: Usiamo un layout a "tabella" con percentuali (80% e 20%)
        // Questo impedisce fisicamente alla priorità di scivolare fuori dal foglio a destra
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

        // --- 2. METADATI (Scadenza o Esportazione) ---
        if (document.getElementById("exportIncludeDate")?.checked) {
            if (note.dueDate) {
                // Se c'è una scadenza impostata
                const dateStr = new Date(note.dueDate).toLocaleString('it-IT');
                html += `<p style="color: #666; font-size: 12px; margin-bottom: 5px;">📅 <strong>Data di Scadenza:</strong> ${dateStr}</p>`;
            } else {
                // Se NON c'è scadenza, mostra quando è stato creato il PDF
                const dateStr = new Date().toLocaleString('it-IT');
                html += `<p style="color: #999; font-size: 11px; margin-bottom: 5px;">📄 Data Esportazione: ${dateStr}</p>`;
            }
        }
        if (document.getElementById("exportIncludeTags")?.checked && note.tags && note.tags.length > 0) {
            html += `<p style="color: #666; font-size: 12px; margin-bottom: 20px;">🏷️ <strong>Etichette:</strong> ${note.tags.map(t => '#' + t).join(', ')}</p>`;
        }

        // --- 3. CONTENUTO ---
        const parsedBody = Utils.parseMarkdown(note.description || "*Nessun contenuto.*");
        const cleanBody = parsedBody.replace(/<button[^>]*>.*?<\/button>/g, '');
        
        html += `<div style="margin-top: 25px; line-height: 1.8; font-size: 14px; word-wrap: break-word;">${cleanBody}</div>`;
        printContainer.innerHTML = html;

        // Opzioni del convertitore PDF
        const opt = {
            margin:       15,
            filename:     `${note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        // Avvia la conversione
        html2pdf().set(opt).from(printContainer).save().then(() => {
            if (typeof Utils !== 'undefined') Utils.showToast("✅ PDF generato e scaricato!");
        });
    }

    /**
     * Funzione d'appoggio per forzare il download di un file generato
     */
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}