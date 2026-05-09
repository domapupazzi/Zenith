/**
 * @class GraphManager
 * @description Gestisce la Mappa Relazionale con sfondo galattico animato, 
 * fisica anti-sovrapposizione, centratura elastica e Frecce Direzionali a prova di bug.
 */
class GraphManager {
    constructor(app) { 
        this.app = app; 
        this.simulation = null; 
        this.currentMode = 'filesystem'; 
    }

    render() {
        const container = document.getElementById("graph-container");
        if (!container || typeof d3 === 'undefined') return;

        // 🌌 SFONDO SPAZIALE PROFONDO
        container.style.background = "radial-gradient(circle at center, #0a0a1a 0%, #000000 100%)";
        container.style.position = "relative";
        container.style.overflow = "hidden";

        const oldSvg = container.querySelector("svg");
        if (oldSvg) oldSvg.remove();
        const oldToggle = container.querySelector(".graph-toggle-container");
        if (oldToggle) oldToggle.remove();

        // 🟢 GESTIONE LEGENDE (Mostra/Nasconde l'HTML corretto)
        const fsLegend = document.getElementById("graph-legend");
        if (fsLegend) {
            // Se siamo in modalità filesystem la mostra, altrimenti la nasconde
            fsLegend.style.display = this.currentMode === 'tags' ? 'none' : 'block';
        }

        let tagLegend = document.getElementById("tag-graph-legend");
        if (this.currentMode === 'tags') {
            if (!tagLegend) {
                tagLegend = this.createTagLegend();
                container.appendChild(tagLegend);
            }
            tagLegend.style.display = 'block';
        } else if (tagLegend) {
            tagLegend.style.display = 'none';
        }

        const toggleContainer = document.createElement("div");
        toggleContainer.className = "graph-toggle-container";
        toggleContainer.style.cssText = "position: absolute; top: 20px; left: 50%; transform: translateX(-50%); z-index: 10; display: flex; gap: 10px; background: rgba(30, 30, 50, 0.8); backdrop-filter: blur(5px); padding: 8px; border-radius: 12px; border: 1px solid var(--border); box-shadow: 0 4px 15px rgba(0,0,0,0.5);";

        toggleContainer.appendChild(this.createToggleBtn("🗂️ File System", 'filesystem'));
        toggleContainer.appendChild(this.createToggleBtn("🏷️ Mappa Etichette", 'tags'));
        container.appendChild(toggleContainer);

        if (this.currentMode === 'filesystem') {
            this.renderFileSystemGraph(container);
        } else {
            this.renderTagGraph(container);
        }
    }

    createToggleBtn(text, mode) {
        const btn = document.createElement("button");
        btn.className = "btn";
        btn.style.cssText = `padding: 6px 12px; font-size: 13px; border-radius: 6px; border: none; cursor: pointer; transition: all 0.2s; ${this.currentMode === mode ? 'background: var(--accent); color: var(--text-on-accent, #ffffff);' : 'background: transparent; color: var(--text-2);'}`;
        btn.innerHTML = text;
        btn.onclick = () => { this.currentMode = mode; this.render(); };
        return btn;
    }

    createTagLegend() {
        const div = document.createElement("div");
        div.id = "tag-graph-legend";
        div.style.cssText = "position: absolute; top: 80px; left: 20px; background: rgba(20, 20, 35, 0.9); padding: 15px; border-radius: 10px; border: 1px solid var(--border); color: #fff; z-index: 5; backdrop-filter: blur(4px);";
        
        div.innerHTML = `
            <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; font-size: 12px;">
                <h4 style="margin-bottom: 12px; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: var(--text-1); border-bottom: 1px solid rgba(255, 255, 255, 0.2); padding-bottom: 6px;">LEGENDA ETICHETTE</h4>
                <li style="display: flex; align-items: center; gap: 10px;"><div style="width: 12px; height: 12px; border-radius: 50%; background: var(--accent); border: 1px solid #fff;"></div><span>Tag Standard</span></li>
                <li style="display: flex; align-items: center; gap: 10px;"><div style="width: 20px; height: 20px; border-radius: 50%; background: var(--accent); border: 2px solid #fff;"></div><span>Tag Genitore (Pianeta)</span></li>
                <li style="display: flex; align-items: center; gap: 10px;"><div style="width: 14px; height: 14px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 10px var(--accent); border: 1px solid #fff;"></div><span>Tag con Alias (Brillante)</span></li>
                <li style="display: flex; align-items: center; gap: 10px;"><div style="width: 25px; height: 2px; background: rgba(255,255,255,0.4); position: relative;"><span style="position:absolute; right:-2px; top:-6px; font-size:10px;">▶</span></div><span>Gerarchia (Padre ➔ Figlio)</span></li>
            </ul>`;
        return div;
    }

    renderFileSystemGraph(container) {
        const width = container.clientWidth, height = container.clientHeight;
        const nodes = [{ id: "root", name: "Zenith", type: "root", size: 65 }];
        const links = [];

        (this.app.loggedUser.folders || []).forEach(f => {
            nodes.push({ id: f.id, name: f.name, type: (!f.parentId || f.parentId === "root") ? "workspace" : "folder", size: 30 });
            links.push({ source: f.parentId || "root", target: f.id });
        });

        this.app.loggedUser.notes.filter(n => n.status !== 'trashed').forEach(n => {
            nodes.push({ id: n.id, name: n.title, type: "note", size: 12, prio: n.priority });
            links.push({ source: n.folderId || "root", target: n.id });

            // 🟢 SOLUZIONE FINALE: IL GRAFO LEGGE LE NOTE IN TEMPO REALE!
            // Addio salvataggi difettosi, la mappa si autocompila leggendo il testo
            if (n.description) {
                const matches = [...n.description.matchAll(/\[\[(.*?)\]\]/g)];
                if (matches.length > 0) {
                    const linkedTitles = matches.map(m => m[1].toLowerCase().trim());
                    
                    this.app.loggedUser.notes.forEach(targetNote => {
                        // Se la nota esiste, non è nel cestino, ed è menzionata nel testo...
                        if (targetNote.status !== 'trashed' && targetNote.id !== n.id) {
                            if (linkedTitles.includes(targetNote.title.toLowerCase().trim())) {
                                links.push({ source: n.id, target: targetNote.id, type: 'wiki-link' });
                            }
                        }
                    });
                }
            }
        });

        this.buildD3Graph(container, nodes, links, width, height, "filesystem");
    }

    renderTagGraph(container) {
        const width = container.clientWidth, height = container.clientHeight;
        const nodes = []; const links = [];
        const tags = this.app.tagManager.tags;
        const tagNames = Object.keys(tags);
        const tagCounts = {};
        this.app.loggedUser.notes.forEach(n => { if (n.status !== 'trashed' && n.tags) n.tags.forEach(t => { const lowT = t.toLowerCase().trim(); tagCounts[lowT] = (tagCounts[lowT] || 0) + 1; }); });

        nodes.push({ id: "TAG_ROOT", name: "Etichette", type: "root", size: 70, color: "var(--text-1)" });

        tagNames.forEach(tagName => {
            const data = tags[tagName]; const count = tagCounts[tagName] || 0;
            const isParent = tagNames.some(t => tags[t].parent === tagName);
            let size = 20 + (count * 2); if (isParent) size += 15;
            nodes.push({ id: tagName, name: "#" + tagName, type: "tag", size: Math.min(size, 65), color: data.color || "var(--accent)", aliases: data.aliases || [], hasAliases: data.aliases && data.aliases.length > 0 });
            if (data.parent && tags[data.parent]) links.push({ source: data.parent, target: tagName });
            else links.push({ source: "TAG_ROOT", target: tagName });
        });
        this.buildD3Graph(container, nodes, links, width, height, "tags");
    }

    buildD3Graph(container, nodes, links, width, height, mode) {
        const svg = d3.select(container).append("svg")
            .attr("width", "100%").attr("height", "100%")
            .call(d3.zoom().scaleExtent([0.1, 4]).on("zoom", (e) => g.attr("transform", e.transform)));
        
        // 🌌 STELLE LUMINOSE
        const starsG = svg.append("g").attr("class", "stars-layer");
        starsG.append("animateTransform").attr("attributeName", "transform").attr("type", "rotate").attr("from", `0 ${width/2} ${height/2}`).attr("to", `360 ${width/2} ${height/2}`).attr("dur", "250s").attr("repeatCount", "indefinite");

        for(let i=0; i<150; i++) {
            starsG.append("circle")
                .attr("cx", Math.random() * width * 1.5 - width * 0.25)
                .attr("cy", Math.random() * height * 1.5 - height * 0.25)
                .attr("r", Math.random() * 1.5 + 0.5)
                .attr("fill", "#ffffff")
                .style("opacity", Math.random())
                .append("animate").attr("attributeName", "opacity").attr("values", "0.1; 1; 0.1").attr("dur", (Math.random() * 4 + 2) + "s").attr("repeatCount", "indefinite");
        }

        const defs = svg.append("defs");

        // 🟢 FIX SPAZI URL: Aggiunto encodeURI per risolvere gli spazi nei nomi delle cartelle
        const absoluteUrl = encodeURI(window.location.href.split('#')[0]);

        // Freccia di base (grigia per gerarchie)
        defs.append("marker")
            .attr("id", "arrow-default")
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 10) // La punta della freccia tocca la fine della linea
            .attr("refY", 0)
            .attr("markerWidth", 8) 
            .attr("markerHeight", 8)
            .attr("orient", "auto")
            .append("path")
            .attr("d", "M 0,-5 L 10,0 L 0,5 Z")
            .style("fill", "#a0a0a8"); 

        // Freccia luminosa per Link Bidirezionali
        defs.append("marker")
            .attr("id", "arrow-wiki")
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 10)
            .attr("refY", 0)
            .attr("markerWidth", 10)
            .attr("markerHeight", 10)
            .attr("orient", "auto")
            .append("path")
            .attr("d", "M 0,-5 L 10,0 L 0,5 Z")
            .style("fill", "#6c7af0");

        const filter = defs.append("filter").attr("id", "glow");
        filter.append("feGaussianBlur").attr("stdDeviation", "3.5").attr("result", "coloredBlur");
        const feMerge = filter.append("feMerge");
        feMerge.append("feMergeNode").attr("in", "coloredBlur");
        feMerge.append("feMergeNode").attr("in", "SourceGraphic");

        const g = svg.append("g");
        
        this.simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(mode === 'tags' ? 160 : 120))
            .force("charge", d3.forceManyBody().strength(mode === 'tags' ? -800 : -500))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collide", d3.forceCollide().radius(d => (d.size || 20) + 15).iterations(3))
            .force("x", d3.forceX(width / 2).strength(d => d.type === "root" ? 0.3 : 0))
            .force("y", d3.forceY(height / 2).strength(d => d.type === "root" ? 0.3 : 0));

        // 🟢 FIX DEFINITIVO URL: Noterai gli apici singoli -> url('${absoluteUrl}#arrow-wiki')
        // Questi apici permettono al CSS di ignorare eventuali spazi nel percorso del file
        const link = g.append("g").selectAll("line").data(links).enter().append("line")
            .attr("class", d => d.type === 'wiki-link' ? "graph-link-wiki" : "graph-link")
            .style("stroke-width", d => d.type === 'wiki-link' ? "2px" : "1.5px")
            .style("stroke-dasharray", d => d.type === 'wiki-link' ? "5,5" : "none")
            .style("stroke", d => d.type === 'wiki-link' ? "#6c7af0" : "rgba(255,255,255,0.3)")
            .attr("marker-end", d => d.type === 'wiki-link' ? `url('${absoluteUrl}#arrow-wiki')` : `url('${absoluteUrl}#arrow-default')`);

        const node = g.append("g").selectAll("g").data(nodes).enter().append("g")
            .call(d3.drag()
                .on("start", (e, d) => { if (!e.active) this.simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
                .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
                .on("end", (e, d) => { 
                    if (!e.active) this.simulation.alphaTarget(0); 
                    d.fx = null; d.fy = null; 
                }));

        node.each(function(d) {
            const sel = d3.select(this);
            if (d.type === "root") {
                sel.append("path").attr("class", "graph-node-root").attr("d", d3.symbol(d3.symbolStar, 4000)()).style("fill", "#fff").style("filter", "url(#glow)");
            } else if (d.type === "tag") {
                if (d.hasAliases) sel.append("circle").attr("r", d.size + 4).attr("fill", d.color).attr("opacity", 0.3).attr("filter", "url(#glow)");
                sel.append("circle").attr("r", d.size).attr("fill", d.color).attr("stroke", "#fff").attr("stroke-width", d.hasAliases ? "3px" : "1px");
            } else if (d.type === "workspace") {
                sel.append("polygon").attr("class", "graph-node-workspace").attr("points", "-30,20 30,20 40,-20 0,-45 -40,-20");
            } else if (d.type === "folder") {
                sel.append("rect").attr("class", "graph-node-folder").attr("width", 40).attr("height", 40).attr("x", -20).attr("y", -20);
            } else {
                const colors = { alta: "#e06060", media: "#e0a840", bassa: "#6ecf6e" };
                sel.append("circle").attr("class", "graph-node-note").attr("r", d.size || 15).attr("fill", colors[d.prio] || "#888");
            }
        });

        node.append("text").attr("class", "graph-label").attr("dy", d => (d.size || 15) + 18).style("fill", "#fff").style("text-shadow", "0 2px 4px rgba(0,0,0,0.8)").text(d => d.name);

        if (mode === 'tags') {
            node.append("text").attr("class", "graph-label").attr("dy", d => (d.size || 15) + 32).attr("text-anchor", "middle").style("font-size", "10px").style("fill", "rgba(255,255,255,0.6)").text(d => (d.aliases && d.aliases.length > 0) ? `(${d.aliases.join(', ')})` : "");
        }

        node.on("click", (e, d) => { 
            if (d.type === "note") this.app.notes.openModalById(d.id); 
            else if (d.type === "folder" || d.type === "workspace") this.app.fileSystem.showFolder(d.id);
            else if (d.type === "tag") { this.app.navigate('mie-note'); this.app.notes.triggerTagSearch(d.id); }
        });

        this.simulation.on("tick", () => {
            // Trigonometria Perfetta
            link.attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => {
                    const dx = d.target.x - d.source.x;
                    const dy = d.target.y - d.source.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist === 0) return d.target.x;
                    
                    let targetRadius = (d.target.size || 15);
                    if (d.target.type === "root") targetRadius = 35;
                    else if (d.target.type === "folder" || d.target.type === "workspace") targetRadius = 25;
                    
                    const offset = targetRadius + 4; 
                    const safeOffset = Math.min(offset, dist - 2); 
                    return d.target.x - (dx * safeOffset / dist);
                })
                .attr("y2", d => {
                    const dx = d.target.x - d.source.x;
                    const dy = d.target.y - d.source.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist === 0) return d.target.y;
                    
                    let targetRadius = (d.target.size || 15);
                    if (d.target.type === "root") targetRadius = 35;
                    else if (d.target.type === "folder" || d.target.type === "workspace") targetRadius = 25;
                    
                    const offset = targetRadius + 4;
                    const safeOffset = Math.min(offset, dist - 2);
                    return d.target.y - (dy * safeOffset / dist);
                });

            node.attr("transform", d => `translate(${d.x},${d.y})`);
        });
    }
}