import * as d3 from 'd3';
import { scenarios } from './config/scenarios.js';
import { difficulties } from './config/difficulties.js';
import { tools } from './config/tools.js';

        export class EpidemicSimulator {
            constructor() {
                this.currentScreen = 'welcome';
                this.currentScenario = null;
                this.selectedDifficulty = 'medium';
                this.gameState = null;
                this.network = { nodes: [], links: [] };
                this.simulation = null;
                this.selectedTool = null;
                this.audioContext = null;
                this.masterGain = null;
                this.themeMusicTimeout = null;
                this.themeMusicSequence = [];

                this.scenarios = scenarios;

                this.difficulties = difficulties;

                this.tools = tools;

                this.init();
            }

            init() {
                this.initAudio();
                this.populateMenu();
                this.bindEvents();
                this.showScreen('welcome');
            }
            
            initAudio() {
                try {
                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    this.masterGain = this.audioContext.createGain();
                    this.masterGain.gain.value = 0.3; // Default volume
                    this.masterGain.connect(this.audioContext.destination);
                    this.setupThemeMusic();
                } catch(e) {
                    console.error("Web Audio API is not supported in this browser");
                }
            }

            setupThemeMusic() {
                // Notes for a "spy theme" riff
                const note = (freq, dur) => ({ freq, dur });
                const rest = (dur) => ({ freq: 0, dur });
                const E3 = 164.81, F3 = 174.61, Fs3 = 185.00, G3 = 196.00;
                const eighth = 150;

                this.themeMusicSequence = [
                    note(E3, eighth), note(F3, eighth), rest(eighth/2),
                    note(Fs3, eighth), note(G3, eighth*2), rest(eighth/2),
                    note(E3, eighth), note(F3, eighth), rest(eighth/2),
                    note(Fs3, eighth), note(G3, eighth*2), rest(eighth*4)
                ];
            }

            playThemeMusic(noteIndex = 0) {
                if (this.currentScreen !== 'menu') return; // Stop if not on menu

                const { freq, dur } = this.themeMusicSequence[noteIndex];
                if (freq > 0) {
                    this.playSound(freq, dur / 1000, 'triangle');
                }

                const nextNoteIndex = (noteIndex + 1) % this.themeMusicSequence.length;
                this.themeMusicTimeout = setTimeout(() => this.playThemeMusic(nextNoteIndex), dur);
            }

            startThemeMusic() {
                if (this.themeMusicTimeout) clearTimeout(this.themeMusicTimeout);
                if(this.audioContext && this.audioContext.state === 'suspended') {
                    this.audioContext.resume();
                }
                this.playThemeMusic();
            }

            stopThemeMusic() {
                if (this.themeMusicTimeout) {
                    clearTimeout(this.themeMusicTimeout);
                    this.themeMusicTimeout = null;
                }
            }
            
            playSound(frequency, duration, type = 'sine') {
                if (!this.audioContext || this.masterGain.gain.value === 0) return;
                const oscillator = this.audioContext.createOscillator();
                const gainNode = this.audioContext.createGain();
                oscillator.connect(gainNode);
                gainNode.connect(this.masterGain);
                
                oscillator.type = type;
                oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
                gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
                
                oscillator.start(this.audioContext.currentTime);
                oscillator.stop(this.audioContext.currentTime + duration);
            }


            populateMenu() {
                const scenarioGrid = document.querySelector('.scenario-grid');
                scenarioGrid.innerHTML = Object.values(this.scenarios).map(s => `
                    <div class="scenario-card" data-scenario="${s.id}">
                        <div class="scenario-icon">${s.icon}</div>
                        <h3>${s.name}</h3>
                        <p>${s.description}</p>
                        <div class="scenario-stats">
                            <span>${s.duration} days</span> • <span>${s.networkType} network</span>
                        </div>
                    </div>
                `).join('');

                const difficultyGrid = document.querySelector('.difficulty-grid');
                difficultyGrid.innerHTML = Object.entries(this.difficulties).map(([key, d]) => `
                     <div class="difficulty-card" data-difficulty="${key}">
                        <div class="difficulty-icon">${d.icon}</div>
                        <h4>${d.name}</h4>
                        <p>${d.description}</p>
                        <div class="r0-value">R₀: ${d.R0}</div>
                    </div>
                `).join('');
            }
            
            bindEvents() {
                document.getElementById('start-game-btn').addEventListener('click', () => this.showScreen('menu'));

                document.querySelector('.scenario-grid').addEventListener('click', (e) => {
                    const card = e.target.closest('.scenario-card');
                    if (card) this.selectScenario(card.dataset.scenario);
                });
                
                document.querySelector('.difficulty-grid').addEventListener('click', (e) => {
                    const card = e.target.closest('.difficulty-card');
                    if(card) this.selectDifficulty(card.dataset.difficulty);
                });

                document.getElementById('back-to-menu').addEventListener('click', () => this.showScreen('menu'));
                document.getElementById('start-simulation').addEventListener('click', () => this.startGame());
                document.getElementById('next-day').addEventListener('click', () => this.nextDay());
                document.getElementById('pause-game').addEventListener('click', () => this.togglePause());
                document.getElementById('tools-list').addEventListener('click', (e) => {
                    const toolItem = e.target.closest('.tool-item');
                    if (toolItem && !toolItem.classList.contains('disabled')) {
                        this.selectTool(toolItem.dataset.tool);
                    }
                });
                document.getElementById('play-again').addEventListener('click', () => this.startGame());
                document.getElementById('try-different-scenario').addEventListener('click', () => this.showScreen('menu'));

                // Volume control
                document.getElementById('master-volume').addEventListener('input', (e) => {
                    if (this.masterGain) {
                        this.masterGain.gain.value = e.target.value;
                    }
                });
            }

            showScreen(screenName) {
                document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
                document.getElementById(`${screenName}-screen`).classList.add('active');
                this.currentScreen = screenName;

                if (screenName === 'menu') {
                    this.startThemeMusic();
                } else {
                    this.stopThemeMusic();
                }
            }

            selectScenario(scenarioId) {
                this.currentScenario = this.scenarios[scenarioId];
                document.getElementById('briefing-title').textContent = this.currentScenario.name;
                document.getElementById('briefing-description-text').textContent = this.currentScenario.description;
                document.getElementById('briefing-disease').textContent = this.currentScenario.diseaseName;
                document.getElementById('briefing-agent').textContent = this.currentScenario.agent;
                document.getElementById('briefing-vector').textContent = this.currentScenario.vector;
                this.selectDifficulty('medium'); // Default to medium
                this.showScreen('briefing');
            }

            selectDifficulty(difficultyId) {
                this.selectedDifficulty = difficultyId;
                document.querySelectorAll('.difficulty-card').forEach(c => c.classList.remove('selected'));
                document.querySelector(`.difficulty-card[data-difficulty="${difficultyId}"]`).classList.add('selected');
                document.getElementById('briefing-r0').textContent = this.difficulties[difficultyId].R0;
            }

            startGame() {
                this.initGameState();
                this.createNetwork();
                this.setupVisualization();
                this.updateUI();
                this.showScreen('game');
                this.addLogEntry(`Simulation started for ${this.currentScenario.name}.`, true);
            }

            initGameState() {
                const difficulty = this.difficulties[this.selectedDifficulty];
                this.gameState = {
                    day: 1,
                    paused: false,
                    gameOver: false,
                    stats: { totalInfected: 0, totalProtected: 0, linksSevered: 0, initialPopulation: 100, totalDead: 0, totalRecovered: 0 },
                    dailyUsage: Object.keys(this.tools).reduce((acc, tool) => ({ ...acc, [tool]: 0 }), {}),
                    usedOnPeople: new Set(),
                    log: [],
                };
            }
            
            createNetwork() {
                const n = this.gameState.stats.initialPopulation;
                let nodes = Array.from({ length: n }, (_, i) => ({ id: i, state: 'healthy', daysInfected: 0, removed: false }));
                let links;

                switch (this.currentScenario.networkType) {
                    case 'scale-free': ({ links } = this.generateScaleFreeNetwork(n, 4)); break;
                    case 'small-world': ({ links } = this.generateSmallWorldNetwork(n, 8, 0.15)); break;
                    default: ({ links } = this.generateRandomNetwork(n, 0.08));
                }
                
                // Infect initial nodes
                for (let i = 0; i < this.currentScenario.initialInfected; i++) {
                    let node;
                    do {
                        node = nodes[Math.floor(Math.random() * n)];
                    } while (node.state === 'infected');
                    node.state = 'infected';
                    this.gameState.stats.totalInfected++;
                }

                this.network = { nodes, links };
            }

            generateScaleFreeNetwork(n, m) { const links = []; for(let i=m; i<n; i++) for(let j=0; j<m; j++) links.push({source: i, target: Math.floor(Math.random()*i)}); return { links }; }
            generateSmallWorldNetwork(n, k, p) { const links = []; for(let i=0; i<n; i++) for(let j=1; j<=k/2; j++) { let target = (i+j)%n; if(Math.random()<p) target=Math.floor(Math.random()*n); links.push({source:i, target}); } return { links }; }
            generateRandomNetwork(n, p) {
                const links = [];
                for (let i = 0; i < n; i++) {
                    for (let j = i + 1; j < n; j++) {
                        if (Math.random() < p) links.push({ source: i, target: j });
                    }
                }
                return { links };
            }
            
            setupVisualization() {
                const container = document.querySelector('.network-container');
                const svg = d3.select('#network-svg');
                svg.selectAll('*').remove();
                
                const width = container.clientWidth;
                const height = container.clientHeight;
                
                this.visGroup = svg.append('g');
                this.linkGroup = this.visGroup.append('g').attr("class", "links");
                this.nodeGroup = this.visGroup.append('g').attr("class", "nodes");
                this.particleGroup = this.visGroup.append('g').attr("class", "particles");

                const zoom = d3.zoom().scaleExtent([0.3, 7]).on('zoom', (event) => this.visGroup.attr('transform', event.transform));
                svg.call(zoom);

                this.simulation = d3.forceSimulation()
                    .force('link', d3.forceLink().id(d => d.id).distance(50).strength(0.5))
                    .force('charge', d3.forceManyBody().strength(-100))
                    .force('center', d3.forceCenter(width / 2, height / 2))
                    .force('collision', d3.forceCollide().radius(12));

                this.simulation.on('tick', () => {
                    this.nodeGroup.selectAll('circle').attr('cx', d => d.x).attr('cy', d => d.y);
                    this.linkGroup.selectAll('line').attr('x1', d => d.source.x).attr('y1', d => d.source.y)
                        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
                });

                this.updateNetworkVisualization(true);
            }

            updateNetworkVisualization(isInitial = false) {
                const drag = d3.drag()
                    .on('start', (event, d) => { if (!event.active) this.simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
                    .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
                    .on('end', (event, d) => { if (!event.active) this.simulation.alphaTarget(0); d.fx = null; d.fy = null; });

                // Update nodes
                const node = this.nodeGroup.selectAll('circle').data(this.network.nodes, d => d.id);
                
                node.exit()
                    .transition().duration(500)
                    .attr('r', 0)
                    .remove();

                node.enter().append('circle')
                    .attr('class', d => `node ${d.state}`)
                    .attr('r', 0)
                    .on('click', (event, d) => this.handleNodeClick(event, d))
                    .on('mouseover', function() { d3.select(this).transition().duration(150).attr('r', 12); })
                    .on('mouseout', function() { d3.select(this).transition().duration(150).attr('r', 7); })
                    .call(drag)
                    .merge(node)
                    .attr('cx', d => d.x).attr('cy', d => d.y)
                    .transition().duration(isInitial ? 500 : 250).delay((d,i) => isInitial ? i * 10 : 0)
                    .attr('r', 7)
                    .attr('class', d => `node ${d.state}`);

                // Update links
                const link = this.linkGroup.selectAll('line').data(this.network.links, d => `${d.source.id}-${d.target.id}`);
                
                link.exit()
                    .transition().duration(300)
                    .style('stroke-opacity', 0)
                    .remove();
                
                link.enter().append('line')
                    .attr('class', 'link')
                    .on('click', (event, d) => this.handleLinkClick(event, d));
                
                // Update simulation
                this.simulation.nodes(this.network.nodes);
                this.simulation.force('link').links(this.network.links);
                if(!isInitial) this.simulation.alpha(0.3).restart();
            }
            
            handleNodeClick(event, node) {
                if (this.selectedTool === 'severLink') return; // Sever tool only works on links
                if (!this.selectedTool || node.removed) return;
                
                const toolConfig = this.tools[this.selectedTool];
                const { allowed, reason } = this.canUseTool(this.selectedTool, node);
                if (!allowed) {
                    this.showNotification(reason, 'error');
                    return;
                }

                if (toolConfig.validTargets.includes(node.state) || toolConfig.validTargets.includes('any')) {
                    this.applyToolToNode(this.selectedTool, node);
                } else {
                    this.showNotification(`Cannot use ${toolConfig.name} on a ${node.state} person.`, 'error');
                }
            }
            
            handleLinkClick(event, link) {
                if (this.selectedTool !== 'severLink') return;
                const { allowed, reason } = this.canUseTool('severLink');
                if (!allowed) {
                    this.showNotification(reason, 'error');
                    return;
                }
                this.applyToolToLink(link);
            }

            canUseTool(toolId, target = null) {
                const tool = this.tools[toolId];
                const difficulty = this.difficulties[this.selectedDifficulty];
                const limit = Math.floor(tool.baseDailyLimit * difficulty.toolLimitMultiplier);

                if (this.gameState.day < tool.availableDay) return { allowed: false, reason: `${tool.name} available on Day ${tool.availableDay}.` };
                if (this.gameState.dailyUsage[toolId] >= limit) return { allowed: false, reason: `Daily limit for ${tool.name} reached.` };
                
                if(target && target.id !== undefined) { // It's a node
                    if (tool.oncePerPerson && this.gameState.usedOnPeople.has(`${toolId}-${target.id}`)) return { allowed: false, reason: `${tool.name} already used on this person.` };
                    if (target.state === 'vaccinated' || target.state === 'quarantined') return { allowed: false, reason: `Person is already protected.` };
                    if (toolId === 'vaccinate' && target.state !== 'healthy') return { allowed: false, reason: 'Vaccine only works on healthy individuals.' };
                }

                return { allowed: true };
            }

            applyToolToNode(toolId, node) {
                this.gameState.dailyUsage[toolId]++;
                if (this.tools[toolId].oncePerPerson) this.gameState.usedOnPeople.add(`${toolId}-${node.id}`);

                let logMessage = '';
                if (toolId === 'vaccinate') {
                    node.state = 'vaccinated';
                    this.gameState.stats.totalProtected++;
                    logMessage = `Person ${node.id} has been vaccinated.`;
                } else if (toolId === 'quarantine') {
                    node.state = 'quarantined';
                    this.gameState.stats.totalProtected++;
                    logMessage = `Person ${node.id} has been quarantined.`;
                }
                
                node.removed = true;
                this.playSound(800, 0.2, 'sine');
                
                this.network.nodes = this.network.nodes.filter(n => !n.removed);
                this.network.links = this.network.links.filter(l => !l.source.removed && !l.target.removed);
                
                this.showNotification(logMessage, 'success');
                this.addLogEntry(logMessage);
                this.updateUI();
                this.updateNetworkVisualization();
            }

            applyToolToLink(linkToRemove) {
                this.gameState.dailyUsage.severLink++;
                this.gameState.stats.linksSevered++;
                
                this.network.links = this.network.links.filter(l => l !== linkToRemove);

                const logMessage = `Connection between ${linkToRemove.source.id} and ${linkToRemove.target.id} severed.`;
                this.showNotification(logMessage, 'success');
                this.addLogEntry(logMessage);
                this.playSound(400, 0.15, 'sawtooth');
                this.updateUI();
                this.updateNetworkVisualization();
            }

            nextDay() {
                if (this.gameState.gameOver) return;
                this.gameState.day++;
                Object.keys(this.gameState.dailyUsage).forEach(tool => this.gameState.dailyUsage[tool] = 0);
                
                this.simulateSpread();
                this.updateOutcomes();
                this.checkGameOver();
                
                this.playSound(600, 0.1, 'sine');
                this.addLogEntry(`Day ${this.gameState.day} begins.`, true);
                this.updateUI();
                this.updateNetworkVisualization();
            }

            simulateSpread() {
                const transmissionRate = this.currentScenario.baseTransmissionRate * this.difficulties[this.selectedDifficulty].transmissionMultiplier;
                let newInfections = 0;

                this.network.nodes.filter(n => n.state === 'infected').forEach(infected => {
                    this.network.links
                        .filter(l => !l.severed && (l.source.id === infected.id || l.target.id === infected.id))
                        .forEach(link => {
                            const targetNode = link.source.id === infected.id ? link.target : link.source;
                            if (targetNode.state === 'healthy' && Math.random() < transmissionRate) {
                                targetNode.state = 'infected';
                                this.gameState.stats.totalInfected++;
                                newInfections++;
                                this.animateVirus(infected, targetNode);
                                this.playSound(150, 0.2, 'triangle');
                            }
                        });
                });
                if (newInfections > 0) this.addLogEntry(`${newInfections} new infections reported.`, true);
                this.network.nodes.filter(n => n.state === 'infected').forEach(n => n.daysInfected++);
            }
            
            animateVirus(source, target) {
                const particle = this.particleGroup.append("circle")
                    .attr("class", "virus-particle")
                    .attr("r", 4)
                    .attr("cx", source.x)
                    .attr("cy", source.y);

                particle.transition()
                    .duration(1000)
                    .attr("cx", target.x)
                    .attr("cy", target.y)
                    .on("end", function() {
                        d3.select(this).remove();
                    });
            }


            updateOutcomes() {
                const recoveryTime = this.difficulties[this.selectedDifficulty].recoveryTime;
                const fatalityRate = this.difficulties[this.selectedDifficulty].fatalityRate;
                let needsUpdate = false;

                const nodesToProcess = this.network.nodes.filter(n => n.state === 'infected' && n.daysInfected >= recoveryTime);

                nodesToProcess.forEach(node => {
                    if (Math.random() < fatalityRate) {
                        // Outcome: Death
                        node.state = 'dead';
                        node.removed = true;
                        this.gameState.stats.totalDead++;
                        this.addLogEntry(`Person ${node.id} has died from the infection.`);
                        needsUpdate = true;
                    } else {
                        // Outcome: Recovery
                        node.state = 'recovered';
                        this.gameState.stats.totalRecovered++;
                        this.addLogEntry(`Person ${node.id} has recovered.`);
                    }
                });
                
                if (needsUpdate) {
                    this.network.nodes = this.network.nodes.filter(n => !n.removed);
                    this.network.links = this.network.links.filter(l => !l.source.removed && !l.target.removed);
                    this.updateNetworkVisualization();
                }
            }

            checkGameOver() {
                const activeInfected = this.network.nodes.filter(n => n.state === 'infected').length;
                if (activeInfected === 0 || this.gameState.day >= this.currentScenario.duration) {
                    this.gameState.gameOver = true;
                    this.playSound(261, 1.0, 'sine');
                    setTimeout(() => this.showGameOver(), 1000);
                }
            }

            showGameOver() {
                const success = this.network.nodes.filter(n => n.state === 'infected').length === 0;
                const stats = this.gameState.stats;

                const attackRate = stats.initialPopulation > 0 ? (stats.totalInfected / stats.initialPopulation) * 100 : 0;
                const caseFatalityRate = stats.totalInfected > 0 ? (stats.totalDead / stats.totalInfected) * 100 : 0;

                document.getElementById('game-over-title').textContent = success ? 'Outbreak Contained!' : 'Simulation Over';
                document.getElementById('final-total-infected').textContent = stats.totalInfected;
                document.getElementById('final-total-dead').textContent = stats.totalDead;
                document.getElementById('final-total-recovered').textContent = stats.totalRecovered;
                document.getElementById('final-attack-rate').textContent = `${attackRate.toFixed(1)}%`;
                document.getElementById('final-case-fatality').textContent = `${caseFatalityRate.toFixed(1)}%`;
                document.getElementById('people-protected').textContent = stats.totalProtected;
                
                document.getElementById('game-over-message').textContent = success ?
                    "Excellent work! Your strategic interventions stopped the spread." :
                    "The simulation period has ended. Analyze the results and try a new strategy.";
                
                const badge = document.createElement('span');
                badge.className = `difficulty-badge ${this.selectedDifficulty}`;
                badge.textContent = this.selectedDifficulty;
                document.getElementById('final-difficulty-badge').innerHTML = 'Completed on ';
                document.getElementById('final-difficulty-badge').appendChild(badge);

                this.showScreen('game-over');
            }

            selectTool(toolId) {
                this.selectedTool = this.selectedTool === toolId ? null : toolId;
                document.querySelectorAll('.tool-item').forEach(item => {
                    item.classList.toggle('selected', item.dataset.tool === this.selectedTool);
                });
            }

            updateUI() {
                document.getElementById('game-scenario-name').textContent = this.currentScenario.name;
                const difficulty = this.difficulties[this.selectedDifficulty];
                const badge = `<span class="difficulty-badge ${this.selectedDifficulty}">${difficulty.name}</span>`;
                document.getElementById('current-difficulty-badge').innerHTML = badge;

                document.getElementById('current-day').textContent = this.gameState.day;
                document.getElementById('infected-count').textContent = this.network.nodes.filter(n => n.state === 'infected').length;
                document.getElementById('protected-count').textContent = this.gameState.stats.totalProtected;
                document.getElementById('population-count').textContent = this.network.nodes.length;

                const toolsList = document.getElementById('tools-list');
                toolsList.innerHTML = Object.entries(this.tools).map(([id, tool]) => {
                    const limit = Math.floor(tool.baseDailyLimit * difficulty.toolLimitMultiplier);
                    const available = this.gameState.day >= tool.availableDay;
                    const disabled = !available || this.gameState.dailyUsage[id] >= limit;
                    return `
                        <div class="tool-item ${disabled ? 'disabled' : ''}" data-tool="${id}">
                            <div class="tool-header">
                                <span class="tool-name">${tool.name}</span>
                                <span class="tool-usage">${this.gameState.dailyUsage[id]}/${limit}</span>
                            </div>
                            <p class="tool-description">${tool.description}</p>
                            ${!available ? `<div class="tool-availability">Available Day ${tool.availableDay}</div>` : ''}
                        </div>
                    `;
                }).join('');
            }

            addLogEntry(message, important = false) {
                const logEntry = { day: this.gameState.day, message };
                this.gameState.log.push(logEntry);
                const logContainer = document.getElementById('log-entries');
                const entry = document.createElement('div');
                entry.className = `log-entry ${important ? 'important' : ''}`;
                entry.innerHTML = `<span class="log-time">Day ${logEntry.day}</span> <span class="log-message">${message}</span>`;
                logContainer.prepend(entry);
                if (logContainer.children.length > 50) {
                    logContainer.removeChild(logContainer.lastChild);
                }
            }
            
            showNotification(message, type = 'info') {
                const container = document.getElementById('notification-container');
                const notification = document.createElement('div');
                notification.className = `notification ${type}`;
                notification.textContent = message;
                container.appendChild(notification);
                setTimeout(() => {
                    notification.style.animation = 'fadeOutRight 0.5s forwards';
                    setTimeout(() => notification.remove(), 500);
                }, 3000);
            }

            togglePause() {
                this.gameState.paused = !this.gameState.paused;
                document.getElementById('pause-game').innerHTML = this.gameState.paused ? '▶️ Resume' : '⏸️ Pause';
                if (this.gameState.paused) this.simulation.stop();
                else this.simulation.alpha(0.3).restart();
            }
        }
