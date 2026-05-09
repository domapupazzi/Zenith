/**
 * @class CalendarManager
 * @description Gestisce l'interfaccia e la logica del calendario scadenze, visualizzando i giorni del mese
 * e indicando visivamente le note in scadenza tramite indicatori colorati (dot) in base alla priorità.
 */
class CalendarManager {
    /**
     * Inizializza il manager del calendario.
     * @param {Object} app - L'istanza principale dell'applicazione (NoteFlowApp).
     */
    constructor(app) { 
        this.app = app; 
        this.currentDate = new Date(); 
    }

    /**
     * Inizializza e collega gli ascoltatori di eventi per la navigazione del calendario
     * (mese precedente/successivo), la chiusura della modale giornaliera e il posizionamento dinamico del tooltip.
     */
    initEvents() {
        document.getElementById("prevMonthBtn")?.addEventListener("click", () => this.changeMonth(-1));
        document.getElementById("nextMonthBtn")?.addEventListener("click", () => this.changeMonth(1));
        document.getElementById("closeDayNotesBtn")?.addEventListener("click", () => document.getElementById("dayNotesModal").classList.add("hidden"));
        
        // Calcola in tempo reale la posizione del mouse per spostare il tooltip
        document.addEventListener("mousemove", (e) => { 
            const t = document.getElementById("calTooltip"); 
            if (t && t.classList.contains("visible")) { 
                t.style.left = (e.pageX + 15) + "px"; 
                t.style.top = (e.pageY + 15) + "px"; 
            } 
        });
    }

    /**
     * Sposta la visualizzazione del calendario avanti o indietro di un determinato numero di mesi
     * e richiede immediatamente un nuovo rendering della griglia.
     * @param {number} dir - La direzione e quantità (es. -1 per mese precedente, 1 per mese successivo).
     */
    changeMonth(dir) { 
        this.currentDate.setMonth(this.currentDate.getMonth() + dir); 
        this.render(); 
    }

    /**
     * Calcola la struttura del mese corrente (giorni totali, giorno di inizio settimana)
     * e disegna la griglia HTML del calendario. Inserisce gli indicatori colorati (dot)
     * all'interno dei giorni che contengono note in scadenza.
     */
    render() {
        const grid = document.getElementById("calendarDaysGrid"); 
        const title = document.getElementById("calendarMonthDisplay");
        if (!grid || !title) return;
        
        const y = this.currentDate.getFullYear(); 
        const m = this.currentDate.getMonth();
        const mN = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
        
        title.textContent = `${mN[m]} ${y}`; 
        grid.innerHTML = "";

        const fDom = new Date(y, m, 1).getDay(); 
        const eD = fDom === 0 ? 6 : fDom - 1; // Allinea la settimana partendo da Lunedì (0 = Lun)
        const dIm = new Date(y, m + 1, 0).getDate(); // Trova quanti giorni ha il mese
        
        const tdy = new Date(); 
        const isCM = tdy.getFullYear() === y && tdy.getMonth() === m;
        
        // Filtra solo le note attive che possiedono una data di scadenza
        const aN = this.app.loggedUser.notes.filter(n => n.status !== 'trashed' && n.dueDate);

        // Disegna le celle vuote per l'inizio del mese
        for (let i = 0; i < eD; i++) grid.innerHTML += `<div class="calendar-day empty"></div>`;
        
        // Disegna le celle dei giorni effettivi
        for (let d = 1; d <= dIm; d++) {
            const c = document.createElement("div"); 
            c.className = "calendar-day";
            
            // Evidenzia il giorno odierno
            if (isCM && d === tdy.getDate()) c.classList.add("today");
            
            // Cerca le note in scadenza in questo specifico giorno
            const nTd = aN.filter(n => { 
                const dt = new Date(n.dueDate); 
                return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d; 
            });
            
            let dH = ''; 
            let tD = [];
            
            // Se ci sono note, genera i pallini e prepara il contenuto per il tooltip hover
            if (nTd.length > 0) {
                nTd.forEach(n => { 
                    dH += `<div class="cal-dot ${n.priority}"></div>`; 
                    tD.push(`• ${n.title}`); 
                });
                c.addEventListener("mouseenter", () => { 
                    const t = document.getElementById("calTooltip"); 
                    t.innerHTML = `<h4>Scadenze del ${d}</h4>${tD.join('<br>')}`; 
                    t.classList.add("visible"); 
                });
                c.addEventListener("mouseleave", () => document.getElementById("calTooltip").classList.remove("visible"));
            }
            
            c.innerHTML = `<div class="day-number">${d}</div><div class="day-dots">${dH}</div>`;
            
            // Se ci sono note, apri la modale di dettaglio al click sulla cella
            c.addEventListener("click", () => { 
                if (nTd.length > 0) this.openDayModal(nTd, d, mN[m], y); 
            });
            grid.appendChild(c);
        }
    }

    /**
     * Apre una finestra modale che elenca nel dettaglio tutte le note in scadenza
     * nel giorno selezionato, permettendo di cliccarle per aprirle in modifica.
     * @param {Array} notes - Array contenente gli oggetti Nota in scadenza quel giorno.
     * @param {number} day - Il numero del giorno selezionato (es. 15).
     * @param {string} monthName - Il nome testuale del mese (es. "Aprile").
     * @param {number} year - L'anno corrente (es. 2024).
     */
    openDayModal(notes, day, monthName, year) {
        document.getElementById("dayNotesTitle").textContent = `Scadenze del ${day} ${monthName} ${year}`;
        const lC = document.getElementById("dayNotesList"); 
        lC.innerHTML = "";
        
        notes.forEach(note => {
            const i = document.createElement("div");
            i.style.cssText = "padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-card2); cursor: pointer; transition: border 0.2s, transform 0.1s; display: flex; flex-direction: column; gap: 4px;";
            i.onmouseover = () => { i.style.borderColor = "var(--accent)"; i.style.transform = "translateY(-2px)"; };
            i.onmouseout = () => { i.style.borderColor = "var(--border)"; i.style.transform = "translateY(0)"; };
            
            let pI = note.priority === 'alta' ? '🔴' : (note.priority === 'media' ? '🟡' : '🟢'); 
            let lI = note.pin ? '🔒 ' : '';
            let tS = new Date(note.dueDate).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
            
            i.innerHTML = `<strong style="color: var(--text-1); font-size: 15px;">${lI}${note.title}</strong><div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-2);"><span>${pI} Priorità ${note.priority}</span><span>🕒 Ore: ${tS}</span></div>`;
            
            i.addEventListener("click", (e) => {
                e.stopPropagation(); // Evita conflitti di click
                document.getElementById("dayNotesModal").classList.add("hidden");
                this.app.notes.openModalById(note.id); // Funzione unificata e sicura!
            });
            lC.appendChild(i);
        });
        
        document.getElementById("dayNotesModal").classList.remove("hidden");
    }
}