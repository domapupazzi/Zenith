/**
 * @class CalendarManager
 * @description Gestisce la visualizzazione a griglia del Calendario Mensile.
 * Calcola i giorni, intercetta le note con data di scadenza (dueDate) e 
 * genera gli indicatori visivi (dots), i tooltip e la modale di dettaglio giornaliera.
 */
class CalendarManager {
    /**
     * Costruttore: Inizializza il manager collegandolo al motore principale e imposta la data odierna.
     * @param {Object} app - Istanza principale di ZenithEngine.
     */
    constructor(app) { 
        this.app = app; 
        this.currentDate = new Date(); 
    }

    /**
     * Collega gli ascoltatori degli eventi per i controlli del calendario 
     * (Cambio Mese, Tooltip Hover, Chiusura Modale Giornaliera).
     */
    initEvents() {
        // Navigazione tra i mesi
        document.getElementById("prevMonthBtn")?.addEventListener("click", () => this.changeMonth(-1));
        document.getElementById("nextMonthBtn")?.addEventListener("click", () => this.changeMonth(1));
        
        // Chiusura modale dettaglio giorno
        document.getElementById("closeDayNotesBtn")?.addEventListener("click", () => {
            document.getElementById("dayNotesModal").classList.add("hidden");
        });
        
        // Tooltip "Inseguimento Mouse": Segue il cursore quando un giorno con scadenze viene sfiorato
        document.addEventListener("mousemove", (e) => { 
            const tooltip = document.getElementById("calTooltip"); 
            if (tooltip && tooltip.classList.contains("visible")) { 
                tooltip.style.left = (e.pageX + 15) + "px"; 
                tooltip.style.top = (e.pageY + 15) + "px"; 
            } 
        });
    }

    /**
     * Sposta il riferimento temporale avanti o indietro di 'N' mesi e aggiorna la griglia.
     * @param {number} dir - Direzione (-1 per mese precedente, 1 per mese successivo).
     */
    changeMonth(dir) { 
        this.currentDate.setMonth(this.currentDate.getMonth() + dir); 
        this.render(); 
    }

    /**
     * Calcola la struttura del mese attuale, determina gli spazi vuoti,
     * incrocia i giorni con le note in scadenza dell'utente e genera l'HTML della griglia.
     */
    render() {
        const grid = document.getElementById("calendarDaysGrid"); 
        const title = document.getElementById("calendarMonthDisplay");
        if (!grid || !title) return;
        
        const year = this.currentDate.getFullYear(); 
        const month = this.currentDate.getMonth();
        const monthNames = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
        
        // Aggiorna Titolo Calendario
        title.textContent = `${monthNames[month]} ${year}`; 
        grid.innerHTML = "";

        // Calcolo Matematico Calendario: 
        // Trova il giorno della settimana del 1° del mese (0=Domenica, 1=Lunedì...)
        const firstDayOfMonth = new Date(year, month, 1).getDay(); 
        // Shift per far iniziare la settimana di Lunedì invece che di Domenica
        const emptyDaysAtStart = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1; 
        
        // Quanti giorni ha questo mese? (Impostando giorno 0 del mese successivo)
        const daysInMonth = new Date(year, month + 1, 0).getDate(); 
        
        // Riferimento per evidenziare il giorno corrente (OGGI)
        const today = new Date(); 
        const isCurrentMonthAndYear = today.getFullYear() === year && today.getMonth() === month;
        
        // 1. Estrae tutte le note attive (non nel cestino) che hanno una data di scadenza
        const activeNotesWithDueDate = this.app.loggedUser.notes.filter(n => n.status !== 'trashed' && n.dueDate);

        // 2. Disegna i "Buchi" (Giorni vuoti prima del 1° del mese)
        for (let i = 0; i < emptyDaysAtStart; i++) {
            grid.innerHTML += `<div class="calendar-day empty"></div>`;
        }
        
        // 3. Disegna le celle per ogni giorno effettivo del mese
        for (let day = 1; day <= daysInMonth; day++) {
            const cell = document.createElement("div"); 
            cell.className = "calendar-day";
            
            // Evidenzia la cella se è "Oggi"
            if (isCurrentMonthAndYear && day === today.getDate()) {
                cell.classList.add("today");
            }
            
            // Cerca tutte le note che scadono esattamente in questo giorno (Ignorando l'orario)
            const notesToday = activeNotesWithDueDate.filter(note => { 
                const noteDate = new Date(note.dueDate); 
                return noteDate.getFullYear() === year && noteDate.getMonth() === month && noteDate.getDate() === day; 
            });
            
            let dotsHTML = ''; 
            let tooltipContent = [];
            
            // Se ci sono scadenze oggi:
            if (notesToday.length > 0) {
                notesToday.forEach(note => { 
                    // Crea un pallino (dot) del colore della priorità
                    dotsHTML += `<div class="cal-dot ${note.priority}"></div>`; 
                    tooltipContent.push(`• ${note.title}`); 
                });
                
                // Animazione Tooltip in Hover
                cell.addEventListener("mouseenter", () => { 
                    const tooltip = document.getElementById("calTooltip"); 
                    tooltip.innerHTML = `<h4>Scadenze del ${day}</h4>${tooltipContent.join('<br>')}`; 
                    tooltip.classList.add("visible"); 
                });
                cell.addEventListener("mouseleave", () => {
                    document.getElementById("calTooltip").classList.remove("visible");
                });
            }
            
            // Inietta numero del giorno e pallini colorati nella cella
            cell.innerHTML = `<div class="day-number">${day}</div><div class="day-dots">${dotsHTML}</div>`;
            
            // Se ci sono scadenze, abilita il click per aprire la modale dettagliata
            cell.addEventListener("click", () => { 
                if (notesToday.length > 0) {
                    this.openDayModal(notesToday, day, monthNames[month], year); 
                }
            });

            grid.appendChild(cell);
        }
    }

    /**
     * Genera e mostra una modale (Popup) contenente l'elenco cliccabile 
     * di tutte le note in scadenza nel giorno selezionato.
     * @param {Array} notes - Array di oggetti Nota in scadenza per quel giorno.
     * @param {number} day - Numero del giorno (es. 14).
     * @param {string} monthName - Nome esteso del mese (es. "Giugno").
     * @param {number} year - Anno di riferimento.
     */
    openDayModal(notes, day, monthName, year) {
        document.getElementById("dayNotesTitle").textContent = `Scadenze del ${day} ${monthName} ${year}`;
        const listContainer = document.getElementById("dayNotesList"); 
        listContainer.innerHTML = "";
        
        notes.forEach(note => {
            const item = document.createElement("div");
            
            // Styling inline per la card della singola scadenza
            item.style.cssText = "padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-card2); cursor: pointer; transition: border 0.2s, transform 0.1s; display: flex; flex-direction: column; gap: 4px;";
            
            // Effetto Hover interattivo
            item.onmouseover = () => { 
                item.style.borderColor = "var(--accent)"; 
                item.style.transform = "translateY(-2px)"; 
            };
            item.onmouseout = () => { 
                item.style.borderColor = "var(--border)"; 
                item.style.transform = "translateY(0)"; 
            };
            
            // Decorazioni: Emoji Priorità, Lucchetto se protetta, e formattazione orario
            let priorityEmoji = note.priority === 'alta' ? '🔴' : (note.priority === 'media' ? '🟡' : '🟢'); 
            let lockIcon = note.pin ? '🔒 ' : '';
            let timeString = new Date(note.dueDate).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
            
            // Struttura HTML dell'elemento lista
            item.innerHTML = `
                <strong style="color: var(--text-1); font-size: 15px;">${lockIcon}${note.title}</strong>
                <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-2);">
                    <span>${priorityEmoji} Priorità ${note.priority}</span>
                    <span>🕒 Ore: ${timeString}</span>
                </div>
            `;
            
            // Azione: Cliccando la card, chiude la modale calendario e apre la nota in modifica
            item.addEventListener("click", (e) => {
                e.stopPropagation(); 
                document.getElementById("dayNotesModal").classList.add("hidden");
                this.app.notes.openModalById(note.id); // Delega l'apertura al NotesManager
            });

            listContainer.appendChild(item);
        });
        
        document.getElementById("dayNotesModal").classList.remove("hidden");
    }
}