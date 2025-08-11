// Enhanced Epidemic Control Simulator with Background Music and Fixed Vaccination Logic
class EpidemicSimulator {
    constructor() {
        this.currentScreen = 'menu';
        this.currentScenario = null;
        this.selectedDifficulty = 'medium';
        this.gameState = null;
        this.network = null;
        this.simulation = null;
        this.selectedTool = null;
        this.audioEnabled = true;
        this.audioContext = null;
        this.sounds = {};
        this.backgroundMusic = null;
        this.backgroundVolume = 0.3;
        this.zoomBehavior = null;
        this.currentTransform = d3.zoomIdentity;
        
        // Load scenarios and difficulties from provided data
        this.scenarios = {
            urban: {
                id: "urban",
                name: "Urban Neighborhood Outbreak",
                description: "A mysterious respiratory illness has emerged in the Riverside neighborhood. As lead epidemiologist for the Metro Health Department, you've been called to investigate and contain what appears to be a highly transmissible virus spreading through a tight-knit community with low vaccination rates.",
                role: "You are Dr. Alex Chen, Senior Epidemiologist at Metro Health Department. Your team looks to you for guidance on resource allocation and intervention strategies.",
                networkType: "scale-free",
                duration: 14,
                initialInfected: 2,
                baseTransmissionRate: 0.15,
                audioTheme: "urban"
            },
            school: {
                id: "school", 
                name: "School Reopening Crisis",
                description: "Lincoln High School reopened after winter break, but within days, students are falling ill with flu-like symptoms. As the district's health consultant, you must balance keeping the school open with protecting 800 students and staff.",
                role: "You are the Chief Health Consultant for Metropolitan School District, responsible for the health and safety of over 15,000 students across 23 schools.",
                networkType: "small-world",
                duration: 21,
                initialInfected: 1,
                baseTransmissionRate: 0.12,
                audioTheme: "school"
            },
            festival: {
                id: "festival",
                name: "Music Festival Outbreak", 
                description: "SoundWave Festival brings 50,000 visitors to your county for a weekend of music. Reports of a 'festival flu' are surfacing among attendees. As County Health Director, you have limited time to prevent a multi-state outbreak.",
                role: "You are the County Health Director, coordinating with state and federal agencies to manage a potential superspreader event.",
                networkType: "random",
                duration: 10,
                initialInfected: 3,
                baseTransmissionRate: 0.2,
                audioTheme: "festival"
            },
            care: {
                id: "care",
                name: "Long-term Care Facility",
                description: "Sunset Manor nursing home reports several residents with respiratory symptoms. As Regional Health Coordinator, you must protect the most vulnerable population while maintaining quality of life for 150 residents.",
                role: "You are the Regional Health Coordinator specializing in long-term care facilities, responsible for protecting vulnerable populations.",
                networkType: "small-world", 
                duration: 18,
                initialInfected: 1,
                baseTransmissionRate: 0.18,
                audioTheme: "healthcare"
            },
            global: {
                id: "global",
                name: "International Airport Hub",
                description: "International airports in your region report cases among travelers. As State Epidemiologist, you're the first line of defense against a potential pandemic entering through major transportation hubs.",
                role: "You are the State Epidemiologist, coordinating with CDC and international partners to monitor and respond to emerging threats.", 
                networkType: "scale-free",
                duration: 21,
                initialInfected: 2,
                baseTransmissionRate: 0.14,
                audioTheme: "airport"
            }
        };

        this.difficulties = {
            easy: {
                name: "Easy",
                description: "More resources, slower spread",
                transmissionMultiplier: 0.7,
                toolLimitMultiplier: 1.5,
                recoveryTime: 5
            },
            medium: {
                name: "Medium", 
                description: "Balanced gameplay",
                transmissionMultiplier: 1.0,
                toolLimitMultiplier: 1.0,
                recoveryTime: 7
            },
            hard: {
                name: "Hard",
                description: "Limited resources, rapid spread", 
                transmissionMultiplier: 1.4,
                toolLimitMultiplier: 0.7,
                recoveryTime: 9
            }
        };
        
        this.tools = {
            vaccinate: {
                id: "vaccinate",
                name: "💉 Vaccinate", 
                description: "Protect susceptible individuals (cannot vaccinate infected)",
                availableDay: 2,
                oncePerPerson: true,
                baseDailyLimit: 5,
                validTargets: ["healthy"] // Only healthy individuals can be vaccinated
            },
            quarantine: {
                id: "quarantine",
                name: "🚫 Quarantine",
                description: "Isolate any individual to prevent spread", 
                availableDay: 3,
                oncePerPerson: true,
                baseDailyLimit: 3,
                validTargets: ["healthy", "infected", "recovered"] // Can quarantine any state
            },
            severLink: {
                id: "severLink",
                name: "🔗 Sever Link",
                description: "Break a connection between two people",
                availableDay: 1,
                oncePerPerson: false,
                baseDailyLimit: 3,
                validTargets: ["any"] // Can sever any connection
            }
        };
        
        this.init();
    }
    
    init() {
        this.initAudio();
        this.bindEvents();
        this.showScreen('menu');
    }
    
    async initAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            await this.loadSounds();
            this.setupBackgroundMusic();
        } catch (error) {
            console.warn('Audio initialization failed:', error);
            this.audioEnabled = false;
        }
    }
    
    async loadSounds() {
        this.sounds = {
            vaccination: this.createSound(800, 0.2, 'sine'),
            quarantine: this.createSound(200, 0.3, 'square'),
            'link-break': this.createSound(400, 0.15, 'sawtooth'),
            'infection-spread': this.createSound(150, 0.2, 'triangle'),
            'day-advance': this.createSound(600, 0.1, 'sine'),
            'game-over': this.createChord([261.63, 329.63, 392.00], 1.0),
            'action-denied': this.createSound(300, 0.1, 'square')
        };
    }
    
    setupBackgroundMusic() {
        // Create background music system using Web Audio API
        this.backgroundMusic = {
            urban: this.createAmbientTrack([60, 80, 100, 120], 8.0, 'urban'),
            school: this.createAmbientTrack([200, 400, 600], 6.0, 'school'),
            festival: this.createAmbientTrack([150, 300, 450, 600], 10.0, 'festival'),
            healthcare: this.createAmbientTrack([100, 150, 200], 5.0, 'healthcare'),
            airport: this.createAmbientTrack([80, 160, 240, 320], 12.0, 'airport')
        };
    }
    
    createAmbientTrack(frequencies, duration, theme) {
        return {
            theme,
            oscillators: [],
            gainNodes: [],
            isPlaying: false,
            start: () => {
                if (!this.audioEnabled || !this.audioContext || this.backgroundMusic[theme].isPlaying) return;
                
                this.backgroundMusic[theme].oscillators = [];
                this.backgroundMusic[theme].gainNodes = [];
                
                frequencies.forEach((freq, index) => {
                    const oscillator = this.audioContext.createOscillator();
                    const gainNode = this.audioContext.createGain();
                    const filter = this.audioContext.createBiquadFilter();
                    
                    oscillator.connect(filter);
                    filter.connect(gainNode);
                    gainNode.connect(this.audioContext.destination);
                    
                    oscillator.frequency.setValueAtTime(freq, this.audioContext.currentTime);
                    oscillator.type = index % 2 === 0 ? 'sine' : 'triangle';
                    
                    filter.type = 'lowpass';
                    filter.frequency.setValueAtTime(freq * 3, this.audioContext.currentTime);
                    
                    const baseVolume = this.backgroundVolume / frequencies.length;
                    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
                    gainNode.gain.linearRampToValueAtTime(baseVolume * 0.3, this.audioContext.currentTime + 2);
                    
                    // Add subtle volume modulation for ambient effect
                    setInterval(() => {
                        if (this.backgroundMusic[theme].isPlaying && gainNode.gain) {
                            const variation = (Math.random() - 0.5) * 0.1;
                            const targetVolume = Math.max(0, baseVolume * (0.3 + variation));
                            gainNode.gain.exponentialRampToValueAtTime(targetVolume + 0.001, this.audioContext.currentTime + 2);
                        }
                    }, 3000 + Math.random() * 2000);
                    
                    oscillator.start(this.audioContext.currentTime);
                    
                    this.backgroundMusic[theme].oscillators.push(oscillator);
                    this.backgroundMusic[theme].gainNodes.push(gainNode);
                });
                
                this.backgroundMusic[theme].isPlaying = true;
            },
            stop: () => {
                if (!this.backgroundMusic[theme].isPlaying) return;
                
                this.backgroundMusic[theme].gainNodes.forEach(gainNode => {
                    gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 1);
                });
                
                setTimeout(() => {
                    this.backgroundMusic[theme].oscillators.forEach(osc => {
                        try { osc.stop(); } catch(e) {}
                    });
                    this.backgroundMusic[theme].oscillators = [];
                    this.backgroundMusic[theme].gainNodes = [];
                    this.backgroundMusic[theme].isPlaying = false;
                }, 1000);
            }
        };
    }
    
    startBackgroundMusic(theme) {
        // Stop any currently playing music
        Object.keys(this.backgroundMusic).forEach(key => {
            if (this.backgroundMusic[key].isPlaying) {
                this.backgroundMusic[key].stop();
            }
        });
        
        // Start new theme music
        if (this.backgroundMusic[theme] && this.audioEnabled) {
            setTimeout(() => {
                this.backgroundMusic[theme].start();
            }, 500);
        }
    }
    
    stopBackgroundMusic() {
        Object.keys(this.backgroundMusic).forEach(key => {
            if (this.backgroundMusic[key].isPlaying) {
                this.backgroundMusic[key].stop();
            }
        });
    }
    
    createSound(frequency, duration, type = 'sine') {
        return () => {
            if (!this.audioEnabled || !this.audioContext) return;
            
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            oscillator.type = type;
            
            gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration);
        };
    }
    
    createChord(frequencies, duration) {
        return () => {
            if (!this.audioEnabled || !this.audioContext) return;
            
            frequencies.forEach(freq => {
                const oscillator = this.audioContext.createOscillator();
                const gainNode = this.audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(this.audioContext.destination);
                
                oscillator.frequency.setValueAtTime(freq, this.audioContext.currentTime);
                oscillator.type = 'sine';
                
                gainNode.gain.setValueAtTime(0.05, this.audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
                
                oscillator.start(this.audioContext.currentTime);
                oscillator.stop(this.audioContext.currentTime + duration);
            });
        };
    }
    
    playSound(soundName) {
        if (this.sounds[soundName] && this.audioEnabled) {
            this.sounds[soundName]();
        }
    }
    
    adjustBackgroundVolume(volume) {
        this.backgroundVolume = Math.max(0, Math.min(1, volume));
        // Update all currently playing background music
        Object.keys(this.backgroundMusic).forEach(theme => {
            const track = this.backgroundMusic[theme];
            if (track.isPlaying && track.gainNodes) {
                track.gainNodes.forEach(gainNode => {
                    if (gainNode.gain) {
                        const newVolume = this.backgroundVolume / track.gainNodes.length * 0.3;
                        gainNode.gain.exponentialRampToValueAtTime(newVolume + 0.001, this.audioContext.currentTime + 0.1);
                    }
                });
            }
        });
    }
    
    bindEvents() {
        // Menu screen events
        document.querySelectorAll('.scenario-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const scenarioId = e.currentTarget.dataset.scenario;
                this.selectScenario(scenarioId);
            });
        });
        
        // Difficulty selection events
        document.querySelectorAll('.difficulty-card').forEach(card => {
            card.addEventListener('click', (e) => {
                this.selectDifficulty(e.currentTarget.dataset.difficulty);
            });
        });

        // Briefing screen events
        document.getElementById('back-to-menu').addEventListener('click', () => {
            this.stopBackgroundMusic();
            this.showScreen('menu');
        });
        
        document.getElementById('start-simulation').addEventListener('click', () => {
            this.startGame();
        });
        
        // Game screen events
        document.getElementById('next-day').addEventListener('click', () => {
            this.nextDay();
        });
        
        document.getElementById('pause-game').addEventListener('click', () => {
            this.togglePause();
        });

        // Zoom control events
        document.getElementById('zoom-in').addEventListener('click', () => {
            this.zoomIn();
        });

        document.getElementById('zoom-out').addEventListener('click', () => {
            this.zoomOut();
        });

        document.getElementById('reset-zoom').addEventListener('click', () => {
            this.resetZoom();
        });
        
        // Tool selection events
        document.querySelectorAll('.tool-item').forEach(tool => {
            tool.addEventListener('click', (e) => {
                const toolId = e.currentTarget.dataset.tool;
                this.selectTool(toolId);
            });
        });
        
        // Game over screen events
        document.getElementById('play-again').addEventListener('click', () => {
            this.startGame();
        });
        
        document.getElementById('try-different-scenario').addEventListener('click', () => {
            this.stopBackgroundMusic();
            this.showScreen('menu');
        });
        
        // Audio toggle
        document.getElementById('audio-toggle').addEventListener('click', () => {
            this.toggleAudio();
        });

        // Volume control
        document.getElementById('volume-control').addEventListener('input', (e) => {
            this.adjustBackgroundVolume(e.target.value);
        });
    }
    
    showScreen(screenName) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(`${screenName}-screen`).classList.add('active');
        this.currentScreen = screenName;
    }
    
    selectScenario(scenarioId) {
        this.currentScenario = this.scenarios[scenarioId];
        this.showBriefing();
    }

    selectDifficulty(difficultyId) {
        this.selectedDifficulty = difficultyId;
        
        // Update visual selection
        document.querySelectorAll('.difficulty-card').forEach(card => {
            card.classList.remove('selected');
        });
        document.querySelector(`[data-difficulty="${difficultyId}"]`).classList.add('selected');
    }
    
    showBriefing() {
        document.getElementById('briefing-title').textContent = this.currentScenario.name;
        document.getElementById('briefing-role-text').textContent = this.currentScenario.role;
        document.getElementById('briefing-description-text').textContent = this.currentScenario.description;
        this.showScreen('briefing');
    }
    
    startGame() {
        this.initGameState();
        this.createNetwork();
        this.setupVisualization();
        this.updateUI();
        this.showScreen('game');
        
        // Start background music for the scenario
        this.startBackgroundMusic(this.currentScenario.audioTheme);
        
        // Start with infected individuals on day 1
        this.simulateInitialInfection();
        this.addLogEntry('Simulation started - virus detected in population!', true);
    }
    
    initGameState() {
        const difficulty = this.difficulties[this.selectedDifficulty];
        
        this.gameState = {
            day: 1,
            scenario: this.currentScenario,
            difficulty: this.selectedDifficulty,
            difficultyConfig: difficulty,
            paused: false,
            gameOver: false,
            stats: {
                totalInfected: 0,
                totalProtected: 0,
                totalQuarantined: 0,
                totalVaccinated: 0,
                linksSevered: 0,
                initialPopulation: 0
            },
            dailyUsage: {
                vaccinate: 0,
                quarantine: 0,
                severLink: 0
            },
            usedOnPeople: new Set(),
            actionLog: [],
            minimumConnectivity: 50 // Prevent complete network isolation
        };

        // Update difficulty display
        const difficultyBadge = document.getElementById('current-difficulty');
        if (difficultyBadge) {
            difficultyBadge.textContent = difficulty.name;
            difficultyBadge.className = `difficulty-badge ${this.selectedDifficulty}`;
        }
    }
    
    createNetwork() {
        const networkSize = 100;
        this.gameState.stats.initialPopulation = networkSize;
        
        let nodes, links;
        
        switch (this.currentScenario.networkType) {
            case 'scale-free':
                ({ nodes, links } = this.generateScaleFreeNetwork(networkSize));
                break;
            case 'small-world':
                ({ nodes, links } = this.generateSmallWorldNetwork(networkSize));
                break;
            case 'random':
                ({ nodes, links } = this.generateRandomNetwork(networkSize));
                break;
            default:
                ({ nodes, links } = this.generateRandomNetwork(networkSize));
        }
        
        // Initialize node states
        nodes.forEach((node, i) => {
            node.id = i;
            node.state = 'healthy';
            node.daysSinceInfection = 0;
            node.removed = false;
        });
        
        this.network = { nodes, links };
    }

    simulateInitialInfection() {
        // Start with 2-3 infected individuals based on scenario and difficulty
        const baseInfected = Math.max(2, this.currentScenario.initialInfected);
        const difficultyMultiplier = this.selectedDifficulty === 'hard' ? 1.5 : this.selectedDifficulty === 'easy' ? 0.8 : 1;
        const initialInfected = Math.min(Math.floor(baseInfected * difficultyMultiplier), this.network.nodes.length - 10);
        
        // Select random nodes to infect initially
        const nodesToInfect = [];
        for (let i = 0; i < initialInfected; i++) {
            let randomIndex;
            do {
                randomIndex = Math.floor(Math.random() * this.network.nodes.length);
            } while (nodesToInfect.includes(randomIndex));
            
            nodesToInfect.push(randomIndex);
            this.network.nodes[randomIndex].state = 'infected';
            this.network.nodes[randomIndex].daysSinceInfection = 1;
            this.gameState.stats.totalInfected++;
        }

        this.addLogEntry(`${initialInfected} individuals found infected - containment efforts begin immediately!`, true);
    }
    
    generateScaleFreeNetwork(n) {
        const nodes = Array.from({ length: n }, (_, i) => ({ id: i }));
        const links = [];
        const m = 4; // More connections for harder gameplay
        
        // Start with a small complete graph
        for (let i = 0; i < m + 1; i++) {
            for (let j = i + 1; j < m + 1; j++) {
                links.push({ source: i, target: j });
            }
        }
        
        // Add remaining nodes using preferential attachment
        for (let i = m + 1; i < n; i++) {
            const degrees = new Array(i).fill(0);
            links.forEach(link => {
                degrees[link.source]++;
                degrees[link.target]++;
            });
            
            const totalDegree = degrees.reduce((sum, d) => sum + d, 0);
            const attachedNodes = new Set();
            
            while (attachedNodes.size < Math.min(m, i)) {
                const prob = Math.random() * totalDegree;
                let cumsum = 0;
                for (let j = 0; j < i; j++) {
                    cumsum += degrees[j];
                    if (prob <= cumsum && !attachedNodes.has(j)) {
                        links.push({ source: i, target: j });
                        attachedNodes.add(j);
                        break;
                    }
                }
                // Fallback to prevent infinite loop
                if (attachedNodes.size === 0) {
                    links.push({ source: i, target: Math.floor(Math.random() * i) });
                    break;
                }
            }
        }
        
        return { nodes, links };
    }
    
    generateSmallWorldNetwork(n) {
        const nodes = Array.from({ length: n }, (_, i) => ({ id: i }));
        const links = [];
        const k = 8; // More connections
        const p = 0.15; // Higher rewiring probability
        
        // Create regular ring lattice
        for (let i = 0; i < n; i++) {
            for (let j = 1; j <= k / 2; j++) {
                const target = (i + j) % n;
                links.push({ source: i, target });
            }
        }
        
        // Rewire with probability p
        links.forEach(link => {
            if (Math.random() < p) {
                let newTarget;
                do {
                    newTarget = Math.floor(Math.random() * n);
                } while (newTarget === link.source || 
                         links.some(l => (l.source === link.source && l.target === newTarget) ||
                                        (l.source === newTarget && l.target === link.source)));
                link.target = newTarget;
            }
        });
        
        return { nodes, links };
    }
    
    generateRandomNetwork(n) {
        const nodes = Array.from({ length: n }, (_, i) => ({ id: i }));
        const links = [];
        const p = 0.08; // Higher connection probability
        
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                if (Math.random() < p) {
                    links.push({ source: i, target: j });
                }
            }
        }
        
        return { nodes, links };
    }
    
    setupVisualization() {
        const svg = d3.select('#network-svg');
        svg.selectAll('*').remove();
        
        const width = svg.node().clientWidth;
        const height = svg.node().clientHeight;
        
        // Setup zoom behavior
        this.zoomBehavior = d3.zoom()
            .scaleExtent([0.5, 3])
            .on('zoom', (event) => {
                this.currentTransform = event.transform;
                g.attr('transform', event.transform);
                
                // Update zoom level display
                const zoomLevel = Math.round(event.transform.k * 100);
                const zoomDisplay = document.getElementById('zoom-level-display');
                if (zoomDisplay) {
                    zoomDisplay.textContent = `${zoomLevel}%`;
                }
                
                // Update cursor based on zoom level
                if (event.transform.k > 1) {
                    svg.style('cursor', 'grab');
                } else {
                    svg.style('cursor', 'default');
                }
            });
        
        svg.call(this.zoomBehavior);
        
        // Create main group for zooming/panning
        const g = svg.append('g');
        
        // Create force simulation with proper centering
        this.simulation = d3.forceSimulation(this.network.nodes)
            .force('link', d3.forceLink(this.network.links).id(d => d.id).distance(40))
            .force('charge', d3.forceManyBody().strength(-80))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(10));
        
        // Create links
        const link = g.append('g')
            .selectAll('line')
            .data(this.network.links)
            .enter().append('line')
            .attr('class', 'link')
            .on('click', (event, d) => this.handleLinkClick(event, d));
        
        // Create nodes
        const node = g.append('g')
            .selectAll('circle')
            .data(this.network.nodes)
            .enter().append('circle')
            .attr('class', 'node')
            .attr('r', 7)
            .on('click', (event, d) => this.handleNodeClick(event, d))
            .call(d3.drag()
                .on('start', (event, d) => {
                    if (!event.active) this.simulation.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                })
                .on('drag', (event, d) => {
                    d.fx = event.x;
                    d.fy = event.y;
                })
                .on('end', (event, d) => {
                    if (!event.active) this.simulation.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                }));
        
        // Update visualization on simulation tick
        this.simulation.on('tick', () => {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);
            
            node
                .attr('cx', d => d.x)
                .attr('cy', d => d.y);
        });
        
        // Initial zoom to fit
        setTimeout(() => {
            this.resetZoom();
        }, 1000);
        
        this.updateNetworkVisualization();
    }

    zoomIn() {
        const svg = d3.select('#network-svg');
        svg.transition().duration(300).call(
            this.zoomBehavior.scaleBy, 1.5
        );
    }

    zoomOut() {
        const svg = d3.select('#network-svg');
        svg.transition().duration(300).call(
            this.zoomBehavior.scaleBy, 1 / 1.5
        );
    }

    resetZoom() {
        const svg = d3.select('#network-svg');
        const width = svg.node().clientWidth;
        const height = svg.node().clientHeight;
        
        svg.transition().duration(500).call(
            this.zoomBehavior.transform,
            d3.zoomIdentity.translate(width / 2, height / 2).scale(1).translate(-width / 2, -height / 2)
        );
    }
    
    updateNetworkVisualization() {
        const svg = d3.select('#network-svg');
        
        // Update node classes and visibility
        svg.selectAll('.node')
            .attr('class', d => `node ${d.state}`)
            .style('display', d => d.removed ? 'none' : 'block');
        
        // Update link visibility
        svg.selectAll('.link')
            .style('display', d => {
                const sourceNode = this.network.nodes.find(n => n.id === d.source.id);
                const targetNode = this.network.nodes.find(n => n.id === d.target.id);
                return (sourceNode && sourceNode.removed) || (targetNode && targetNode.removed) ? 'none' : 'block';
            })
            .attr('class', d => d.severed ? 'link severed' : 'link');
    }
    
    handleNodeClick(event, node) {
        if (!this.selectedTool || node.removed) return;
        
        const canUse = this.canUseTool(this.selectedTool, node);
        if (!canUse.allowed) {
            this.playSound('action-denied');
            this.addLogEntry(canUse.reason);
            return;
        }
        
        switch (this.selectedTool) {
            case 'vaccinate':
                this.vaccinateNode(node);
                break;
            case 'quarantine':
                this.quarantineNode(node);
                break;
        }
    }
    
    handleLinkClick(event, link) {
        if (this.selectedTool !== 'severLink') return;
        
        const canUse = this.canUseTool('severLink');
        if (!canUse.allowed) {
            this.playSound('action-denied');
            this.addLogEntry(canUse.reason);
            return;
        }
        
        // Check minimum connectivity constraint
        if (this.getActiveConnections() <= this.gameState.minimumConnectivity) {
            this.playSound('action-denied');
            this.addLogEntry('Cannot sever more connections - minimum network connectivity required for society to function');
            return;
        }
        
        this.severLink(link);
    }

    getActiveConnections() {
        return this.network.links.filter(link => !link.severed).length;
    }
    
    canUseTool(toolId, node = null) {
        const tool = this.tools[toolId];
        const difficulty = this.gameState.difficultyConfig;
        
        // Check day availability
        if (this.gameState.day < tool.availableDay) {
            return {
                allowed: false,
                reason: `${tool.name} not available until day ${tool.availableDay}`
            };
        }
        
        // Calculate adjusted daily limit based on difficulty
        const adjustedLimit = Math.floor(tool.baseDailyLimit * difficulty.toolLimitMultiplier);
        
        // Check daily limit
        if (this.gameState.dailyUsage[toolId] >= adjustedLimit) {
            return {
                allowed: false,
                reason: `Daily limit reached for ${tool.name} (${adjustedLimit}/day)`
            };
        }
        
        // Check once per person restriction
        if (node && tool.oncePerPerson && this.gameState.usedOnPeople.has(`${toolId}-${node.id}`)) {
            return {
                allowed: false,
                reason: `${tool.name} already used on person ${node.id}`
            };
        }
        
        // Check if node is already removed
        if (node && node.removed) {
            return {
                allowed: false,
                reason: `Person ${node.id} has already been removed from the network`
            };
        }

        // Enhanced vaccination logic - only healthy individuals can be vaccinated
        if (toolId === 'vaccinate' && node) {
            if (node.state === 'infected') {
                return {
                    allowed: false,
                    reason: `Cannot vaccinate infected person ${node.id} - try quarantine instead`
                };
            }
            if (node.state === 'recovered') {
                return {
                    allowed: false,
                    reason: `Person ${node.id} has already recovered and has natural immunity`
                };
            }
            if (node.state !== 'healthy') {
                return {
                    allowed: false,
                    reason: `Can only vaccinate healthy individuals`
                };
            }
        }
        
        return { allowed: true };
    }
    
    vaccinateNode(node) {
        this.playSound('vaccination');
        this.removeNodeFromNetwork(node);
        node.state = 'vaccinated';
        
        this.gameState.dailyUsage.vaccinate++;
        this.gameState.stats.totalVaccinated++;
        this.gameState.stats.totalProtected++;
        this.gameState.usedOnPeople.add(`vaccinate-${node.id}`);
        
        this.addLogEntry(`Successfully vaccinated healthy person ${node.id}`, true);
        this.updateUI();
        this.updateNetworkVisualization();
    }
    
    quarantineNode(node) {
        this.playSound('quarantine');
        this.removeNodeFromNetwork(node);
        node.state = 'quarantined';
        
        this.gameState.dailyUsage.quarantine++;
        this.gameState.stats.totalQuarantined++;
        this.gameState.stats.totalProtected++;
        this.gameState.usedOnPeople.add(`quarantine-${node.id}`);
        
        const statusText = node.state === 'infected' ? 'infected' : 'healthy';
        this.addLogEntry(`Quarantined ${statusText} person ${node.id}`, true);
        this.updateUI();
        this.updateNetworkVisualization();
    }
    
    severLink(link) {
        this.playSound('link-break');
        
        // Mark link as severed
        link.severed = true;
        
        this.gameState.dailyUsage.severLink++;
        this.gameState.stats.linksSevered++;
        
        this.addLogEntry(`Severed connection between persons ${link.source.id} and ${link.target.id}`);
        this.updateUI();
        this.updateNetworkVisualization();
    }
    
    removeNodeFromNetwork(node) {
        // Animate node removal
        d3.select('#network-svg').selectAll('.node')
            .filter(d => d === node)
            .classed('removing', true)
            .transition()
            .duration(500)
            .style('opacity', 0)
            .on('end', () => {
                node.removed = true;
                this.updateNetworkVisualization();
                
                // Restart simulation to adjust layout
                this.simulation.alpha(0.3).restart();
            });
    }
    
    nextDay() {
        if (this.gameState.gameOver) return;
        
        this.gameState.day++;
        this.playSound('day-advance');
        
        // Reset daily usage
        Object.keys(this.gameState.dailyUsage).forEach(tool => {
            this.gameState.dailyUsage[tool] = 0;
        });
        
        // Simulate disease spread (more aggressive)
        this.simulateSpread();
        
        // Update recovered status
        this.updateRecovered();
        
        // Check game over conditions
        this.checkGameOver();
        
        this.addLogEntry(`Day ${this.gameState.day} begins`, true);
        this.updateUI();
        this.updateNetworkVisualization();
    }
    
    simulateSpread() {
        const activeNodes = this.network.nodes.filter(n => !n.removed);
        const infectedNodes = activeNodes.filter(n => n.state === 'infected');
        const healthyNodes = activeNodes.filter(n => n.state === 'healthy');
        
        // Calculate transmission rate based on difficulty
        const baseRate = this.currentScenario.baseTransmissionRate;
        const difficulty = this.gameState.difficultyConfig;
        const transmissionRate = baseRate * difficulty.transmissionMultiplier;
        
        // More aggressive spread in early days
        const dayMultiplier = this.gameState.day <= 3 ? 1.5 : 1.0;
        const finalTransmissionRate = transmissionRate * dayMultiplier;
        
        let newInfections = 0;
        
        infectedNodes.forEach(infectedNode => {
            // Find connected healthy nodes through non-severed links
            const connectedHealthy = this.network.links
                .filter(link => !link.severed)
                .filter(link => 
                    (link.source.id === infectedNode.id && healthyNodes.some(h => h.id === link.target.id)) ||
                    (link.target.id === infectedNode.id && healthyNodes.some(h => h.id === link.source.id))
                )
                .map(link => 
                    link.source.id === infectedNode.id ? 
                    healthyNodes.find(h => h.id === link.target.id) : 
                    healthyNodes.find(h => h.id === link.source.id)
                )
                .filter(node => node); // Remove undefined values
            
            connectedHealthy.forEach(healthyNode => {
                if (Math.random() < finalTransmissionRate) {
                    healthyNode.state = 'infected';
                    healthyNode.daysSinceInfection = 0;
                    this.gameState.stats.totalInfected++;
                    newInfections++;
                    this.playSound('infection-spread');
                    this.addLogEntry(`Person ${healthyNode.id} infected by person ${infectedNode.id}`);
                }
            });
        });
        
        // Update days since infection
        activeNodes.filter(n => n.state === 'infected').forEach(node => {
            node.daysSinceInfection++;
        });

        if (newInfections > 0) {
            this.addLogEntry(`${newInfections} new infections reported today`, true);
        }
    }
    
    updateRecovered() {
        const activeNodes = this.network.nodes.filter(n => !n.removed);
        const infectedNodes = activeNodes.filter(n => n.state === 'infected');
        const recoveryTime = this.gameState.difficultyConfig.recoveryTime;
        
        let recoveredCount = 0;
        infectedNodes.forEach(node => {
            if (node.daysSinceInfection >= recoveryTime) {
                node.state = 'recovered';
                recoveredCount++;
                this.addLogEntry(`Person ${node.id} recovered from infection`);
            }
        });

        if (recoveredCount > 0) {
            this.addLogEntry(`${recoveredCount} individuals recovered today`, true);
        }
    }
    
    checkGameOver() {
        const activeNodes = this.network.nodes.filter(n => !n.removed);
        const infectedNodes = activeNodes.filter(n => n.state === 'infected');
        
        // Game over if no more infected or max days reached
        if (infectedNodes.length === 0 || this.gameState.day >= this.currentScenario.duration) {
            this.gameState.gameOver = true;
            this.playSound('game-over');
            setTimeout(() => this.showGameOver(), 1000);
        }
    }
    
    showGameOver() {
        const activeNodes = this.network.nodes.filter(n => !n.removed);
        const infectedNodes = activeNodes.filter(n => n.state === 'infected');
        
        const success = infectedNodes.length === 0;
        const networkReduction = Math.round(((this.gameState.stats.initialPopulation - activeNodes.length) / this.gameState.stats.initialPopulation) * 100);
        
        document.getElementById('game-over-title').textContent = success ? 'Outbreak Contained!' : 'Time\'s Up!';
        document.getElementById('final-day').textContent = this.gameState.day;
        document.getElementById('infections-prevented').textContent = Math.max(0, 50 - this.gameState.stats.totalInfected);
        document.getElementById('people-protected').textContent = this.gameState.stats.totalProtected;
        document.getElementById('network-reduction').textContent = `${networkReduction}%`;
        
        // Update difficulty display
        const finalDifficultyBadge = document.getElementById('final-difficulty');
        if (finalDifficultyBadge) {
            finalDifficultyBadge.textContent = this.difficulties[this.selectedDifficulty].name;
            finalDifficultyBadge.className = `difficulty-badge ${this.selectedDifficulty}`;
        }
        
        const message = success ? 
            `Excellent work! You successfully contained the outbreak on ${this.difficulties[this.selectedDifficulty].name} difficulty. Your strategic interventions prevented widespread transmission.` :
            `The simulation period has ended. While not all infections were prevented, your efforts saved many lives. Consider adjusting your strategy for better results on ${this.difficulties[this.selectedDifficulty].name} difficulty.`;
        
        document.getElementById('game-over-message').textContent = message;
        
        // Fade out background music
        setTimeout(() => {
            this.stopBackgroundMusic();
        }, 2000);
        
        this.showScreen('game-over');
    }
    
    selectTool(toolId) {
        if (this.gameState.gameOver) return;
        
        // Deselect current tool
        document.querySelectorAll('.tool-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // Select new tool
        if (this.selectedTool === toolId) {
            this.selectedTool = null;
            document.getElementById('selected-tool-name').textContent = 'None';
        } else {
            this.selectedTool = toolId;
            document.querySelector(`[data-tool="${toolId}"]`).classList.add('selected');
            document.getElementById('selected-tool-name').textContent = this.tools[toolId].name;
        }
    }
    
    updateUI() {
        const activeNodes = this.network.nodes.filter(n => !n.removed);
        const infectedCount = activeNodes.filter(n => n.state === 'infected').length;
        
        document.getElementById('game-scenario-name').textContent = this.currentScenario.name;
        document.getElementById('current-day').textContent = this.gameState.day;
        document.getElementById('infected-count').textContent = infectedCount;
        document.getElementById('protected-count').textContent = this.gameState.stats.totalProtected;
        document.getElementById('population-count').textContent = activeNodes.length;
        
        // Update tool availability and usage with difficulty adjustments
        Object.keys(this.tools).forEach(toolId => {
            const toolElement = document.querySelector(`[data-tool="${toolId}"]`);
            const usageElement = toolElement.querySelector('.tool-usage');
            const tool = this.tools[toolId];
            const difficulty = this.gameState.difficultyConfig;
            
            const adjustedLimit = Math.floor(tool.baseDailyLimit * difficulty.toolLimitMultiplier);
            usageElement.textContent = `${this.gameState.dailyUsage[toolId]}/${adjustedLimit}`;
            
            const available = this.gameState.day >= tool.availableDay;
            const hasUsagesLeft = this.gameState.dailyUsage[toolId] < adjustedLimit;
            
            toolElement.classList.toggle('disabled', !available || !hasUsagesLeft);
        });
    }
    
    addLogEntry(message, important = false) {
        const logEntry = {
            day: this.gameState.day,
            message,
            important
        };
        
        this.gameState.actionLog.push(logEntry);
        
        const logContainer = document.getElementById('log-entries');
        const entryElement = document.createElement('div');
        entryElement.className = `log-entry ${important ? 'important' : ''}`;
        
        entryElement.innerHTML = `
            <span class="log-time">Day ${logEntry.day}</span>
            <span class="log-message">${logEntry.message}</span>
        `;
        
        logContainer.appendChild(entryElement);
        logContainer.scrollTop = logContainer.scrollHeight;
        
        // Keep log manageable
        if (logContainer.children.length > 50) {
            logContainer.removeChild(logContainer.firstChild);
        }
    }
    
    togglePause() {
        this.gameState.paused = !this.gameState.paused;
        const pauseBtn = document.getElementById('pause-game');
        pauseBtn.textContent = this.gameState.paused ? '▶️ Resume' : '⏸️ Pause';
        
        if (this.gameState.paused) {
            this.simulation.stop();
        } else {
            this.simulation.restart();
        }
    }
    
    toggleAudio() {
        this.audioEnabled = !this.audioEnabled;
        const audioBtn = document.getElementById('audio-toggle');
        audioBtn.textContent = this.audioEnabled ? '🔊' : '🔇';
        audioBtn.classList.toggle('muted', !this.audioEnabled);
        
        if (!this.audioEnabled) {
            this.stopBackgroundMusic();
        } else if (this.currentScreen === 'game' && this.currentScenario) {
            this.startBackgroundMusic(this.currentScenario.audioTheme);
        }
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.game = new EpidemicSimulator();
});