// Game data and configuration
const gameData = {
    epidemiological_parameters: {
        covid19: {r0: 2.8, transmission_prob: 0.1, incubation_days: 5, infectious_days: 7, asymptomatic_rate: 0.3, cfr: 0.02},
        seasonal_flu: {r0: 1.3, transmission_prob: 0.06, incubation_days: 2, infectious_days: 5, asymptomatic_rate: 0.4, cfr: 0.001},
        pandemic_flu: {r0: 1.8, transmission_prob: 0.08, incubation_days: 3, infectious_days: 6, asymptomatic_rate: 0.25, cfr: 0.025}
    },
    scenarios: [
        {
            name: "Urban Neighborhood",
            description: "Low-income urban area with limited healthcare access",
            network_type: "scale-free",
            population: 150,
            disease: "covid19",
            initial_cases: 3,
            tools: {vaccinate: 15, quarantine: 10, sever_link: 8, test: 25, contact_trace: 5},
            vaccine_hesitancy: 0.3,
            objective: "Keep infections under 15%"
        },
        {
            name: "School Reopening", 
            description: "Elementary school during flu season",
            network_type: "small-world",
            population: 200,
            disease: "seasonal_flu",
            initial_cases: 2,
            tools: {vaccinate: 20, quarantine: 15, sever_link: 5, test: 30, contact_trace: 8},
            vaccine_hesitancy: 0.15,
            objective: "Keep infections under 20%"
        },
        {
            name: "Music Festival",
            description: "Large outdoor music festival with mixing crowds",
            network_type: "random", 
            population: 300,
            disease: "covid19",
            initial_cases: 5,
            tools: {vaccinate: 10, quarantine: 8, sever_link: 3, test: 20, contact_trace: 3},
            vaccine_hesitancy: 0.2,
            objective: "Keep infections under 10%"
        },
        {
            name: "Care Facility",
            description: "Nursing home with elderly residents",
            network_type: "small-world",
            population: 80,
            disease: "covid19", 
            initial_cases: 1,
            tools: {vaccinate: 25, quarantine: 20, sever_link: 10, test: 40, contact_trace: 10},
            vaccine_hesitancy: 0.1,
            objective: "Keep infections under 5%"
        },
        {
            name: "Global Network",
            description: "International travel routes during pandemic",
            network_type: "scale-free",
            population: 500,
            disease: "pandemic_flu",
            initial_cases: 8,
            tools: {vaccinate: 30, quarantine: 25, sever_link: 15, test: 50, contact_trace: 12},
            vaccine_hesitancy: 0.25,
            objective: "Keep infections under 25%"
        }
    ],
    node_states: {
        susceptible: {color: "#9E9E9E", description: "Healthy, unvaccinated person"},
        exposed: {color: "#FFC107", description: "Infected but not yet symptomatic"}, 
        infectious: {color: "#F44336", description: "Symptomatic and contagious"},
        recovered: {color: "#4CAF50", description: "Recovered and immune"},
        vaccinated: {color: "#4CAF50", description: "Vaccinated and protected"},
        quarantined: {color: "#424242", description: "Isolated from others"},
        dead: {color: "#000000", description: "Died from infection"}
    }
};

// Game state
class GameState {
    constructor() {
        this.currentScreen = 'title';
        this.selectedScenario = null;
        this.scenario = null;
        this.network = null;
        this.currentDay = 1;
        this.isRunning = false;
        this.speed = 1000;
        this.selectedTool = null;
        this.selectedNode = null;
        this.firstNodeForSever = null;
        this.tools = {};
        this.statistics = {
            susceptible: 0,
            exposed: 0,
            infectious: 0,
            recovered: 0,
            vaccinated: 0,
            quarantined: 0,
            dead: 0
        };
        this.dailyStats = [];
        this.interventionLog = [];
        this.exposureHistory = new Map();
        this.gameTimer = null;
        this.language = 'en';
    }

    reset() {
        this.currentDay = 1;
        this.isRunning = false;
        this.selectedTool = null;
        this.selectedNode = null;
        this.firstNodeForSever = null;
        this.statistics = {
            susceptible: 0,
            exposed: 0,
            infectious: 0,
            recovered: 0,
            vaccinated: 0,
            quarantined: 0,
            dead: 0
        };
        this.dailyStats = [];
        this.interventionLog = [];
        this.exposureHistory.clear();
        if (this.gameTimer) {
            clearInterval(this.gameTimer);
            this.gameTimer = null;
        }
    }
}

// Network node class
class Node {
    constructor(id, x, y) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.baseX = x;
        this.baseY = y;
        this.state = 'susceptible';
        this.connections = [];
        this.age = Math.random() * 80 + 10;
        this.riskLevel = this.age > 65 ? 'high' : (this.age < 18 ? 'medium' : 'low');
        this.daysInState = 0;
        this.isQuarantined = false;
        this.quarantineDays = 0;
        this.isVaccinated = false;
        this.isTested = false;
        this.testDays = 0;
        this.isAsymptomatic = false;
        this.wasExposed = false;
        this.floatOffset = Math.random() * Math.PI * 2;
    }

    addConnection(nodeId) {
        if (!this.connections.includes(nodeId)) {
            this.connections.push(nodeId);
        }
    }

    removeConnection(nodeId) {
        this.connections = this.connections.filter(id => id !== nodeId);
    }

    setState(newState) {
        this.state = newState;
        this.daysInState = 0;
    }

    update(diseaseParams) {
        this.daysInState++;
        
        // Update quarantine
        if (this.isQuarantined) {
            this.quarantineDays++;
            if (this.quarantineDays >= 14) {
                this.isQuarantined = false;
                this.quarantineDays = 0;
            }
        }

        // Update test status
        if (this.isTested) {
            this.testDays++;
            if (this.testDays >= 3) {
                this.isTested = false;
                this.testDays = 0;
            }
        }

        // Disease progression
        if (this.state === 'exposed' && this.daysInState >= diseaseParams.incubation_days) {
            this.setState('infectious');
            this.isAsymptomatic = Math.random() < diseaseParams.asymptomatic_rate;
        } else if (this.state === 'infectious' && this.daysInState >= diseaseParams.infectious_days) {
            if (Math.random() < diseaseParams.cfr && this.riskLevel === 'high') {
                this.setState('dead');
            } else {
                this.setState('recovered');
            }
        }

        // Floating animation
        this.x = this.baseX + Math.sin(Date.now() / 1000 + this.floatOffset) * 3;
        this.y = this.baseY + Math.cos(Date.now() / 1000 + this.floatOffset) * 3;
    }

    canTransmit() {
        return (this.state === 'infectious' || (this.state === 'exposed' && this.daysInState > 1)) 
               && !this.isQuarantined;
    }

    canBeInfected() {
        return this.state === 'susceptible' && !this.isVaccinated && !this.isQuarantined;
    }
}

// Network generation algorithms
class NetworkGenerator {
    static generateScaleFree(size, avgDegree = 4) {
        const nodes = [];
        const edges = [];
        const canvasWidth = 750;
        const canvasHeight = 550;
        const margin = 50;
        
        for (let i = 0; i < size; i++) {
            nodes.push(new Node(i, 
                Math.random() * (canvasWidth - 2 * margin) + margin, 
                Math.random() * (canvasHeight - 2 * margin) + margin
            ));
        }

        const initialNodes = Math.min(3, size);
        for (let i = 0; i < initialNodes; i++) {
            for (let j = i + 1; j < initialNodes; j++) {
                nodes[i].addConnection(j);
                nodes[j].addConnection(i);
                edges.push([i, j]);
            }
        }

        for (let i = initialNodes; i < size; i++) {
            const numConnections = Math.min(avgDegree, i);
            const connectionCandidates = [];
            
            for (let j = 0; j < i; j++) {
                const probability = (nodes[j].connections.length + 1) / (i * avgDegree + initialNodes);
                connectionCandidates.push({node: j, prob: probability});
            }
            
            connectionCandidates.sort((a, b) => b.prob - a.prob);
            
            for (let k = 0; k < numConnections && k < connectionCandidates.length; k++) {
                const target = connectionCandidates[k].node;
                nodes[i].addConnection(target);
                nodes[target].addConnection(i);
                edges.push([i, target]);
            }
        }

        return { nodes, edges };
    }

    static generateSmallWorld(size, clusterSize = 15, rewireProb = 0.1) {
        const nodes = [];
        const edges = [];
        const canvasWidth = 750;
        const canvasHeight = 550;
        const margin = 50;
        
        for (let i = 0; i < size; i++) {
            nodes.push(new Node(i, 
                Math.random() * (canvasWidth - 2 * margin) + margin, 
                Math.random() * (canvasHeight - 2 * margin) + margin
            ));
        }

        const numClusters = Math.ceil(size / clusterSize);
        for (let cluster = 0; cluster < numClusters; cluster++) {
            const start = cluster * clusterSize;
            const end = Math.min(start + clusterSize, size);
            
            for (let i = start; i < end; i++) {
                for (let j = i + 1; j < end; j++) {
                    if (Math.random() < 0.7) {
                        nodes[i].addConnection(j);
                        nodes[j].addConnection(i);
                        edges.push([i, j]);
                    }
                }
            }
        }

        const longDistanceConnections = Math.floor(size * 0.15);
        for (let i = 0; i < longDistanceConnections; i++) {
            const node1 = Math.floor(Math.random() * size);
            const node2 = Math.floor(Math.random() * size);
            
            if (node1 !== node2 && !nodes[node1].connections.includes(node2)) {
                nodes[node1].addConnection(node2);
                nodes[node2].addConnection(node1);
                edges.push([node1, node2]);
            }
        }

        return { nodes, edges };
    }

    static generateRandom(size, connectionProb = 0.03) {
        const nodes = [];
        const edges = [];
        const canvasWidth = 750;
        const canvasHeight = 550;
        const margin = 50;
        
        for (let i = 0; i < size; i++) {
            nodes.push(new Node(i, 
                Math.random() * (canvasWidth - 2 * margin) + margin, 
                Math.random() * (canvasHeight - 2 * margin) + margin
            ));
        }

        for (let i = 0; i < size; i++) {
            for (let j = i + 1; j < size; j++) {
                if (Math.random() < connectionProb) {
                    nodes[i].addConnection(j);
                    nodes[j].addConnection(i);
                    edges.push([i, j]);
                }
            }
        }

        return { nodes, edges };
    }
}

// Disease simulation engine
class DiseaseSimulator {
    static simulateDay(network, diseaseParams) {
        const nodes = network.nodes;
        const newInfections = [];

        nodes.forEach(node => node.update(diseaseParams));

        nodes.forEach(node => {
            if (node.canTransmit()) {
                node.connections.forEach(connectionId => {
                    const target = nodes[connectionId];
                    if (target && target.canBeInfected()) {
                        if (Math.random() < diseaseParams.transmission_prob) {
                            target.setState('exposed');
                            target.wasExposed = true;
                            newInfections.push({
                                from: node.id,
                                to: target.id,
                                day: gameState.currentDay
                            });
                            gameState.exposureHistory.set(target.id, gameState.currentDay);
                        }
                    }
                });
            }
        });

        return newInfections;
    }

    static calculateREffective(network, diseaseParams) {
        const infectiousNodes = network.nodes.filter(node => node.state === 'infectious');
        if (infectiousNodes.length === 0) return 0;

        let totalSecondaryInfections = 0;
        infectiousNodes.forEach(node => {
            const susceptibleContacts = node.connections
                .map(id => network.nodes[id])
                .filter(contact => contact && contact.canBeInfected()).length;
            
            totalSecondaryInfections += susceptibleContacts * diseaseParams.transmission_prob;
        });

        return totalSecondaryInfections / infectiousNodes.length;
    }
}

// Particle system for background effects
class ParticleSystem {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.particles = [];
        this.maxParticles = 50;
        this.init();
    }

    init() {
        for (let i = 0; i < this.maxParticles; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                size: Math.random() * 3 + 1,
                opacity: Math.random() * 0.3 + 0.1
            });
        }
    }

    update() {
        this.particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0 || p.x > this.canvas.width) p.vx *= -1;
            if (p.y < 0 || p.y > this.canvas.height) p.vy *= -1;
        });
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        this.particles.forEach(p => {
            this.ctx.globalAlpha = p.opacity;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, 2 * Math.PI);
            this.ctx.fill();
        });
        this.ctx.globalAlpha = 1;
    }
}

// Canvas renderer
class CanvasRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.hoveredNode = null;
        this.animations = new Map();
    }

    addAnimation(nodeId, type, duration) {
        this.animations.set(nodeId, { type, startTime: Date.now(), duration });
    }

    render(network) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawEdges(network);
        this.drawNodes(network);
        
        if (gameState.selectedNode !== null) {
            const node = network.nodes.find(n => n.id === gameState.selectedNode);
            if (node) {
                this.highlightNode(node);
            }
        }
    }

    drawEdges(network) {
        network.edges.forEach(([nodeA, nodeB]) => {
            const a = network.nodes[nodeA];
            const b = network.nodes[nodeB];
            
            if (a && b && !a.isQuarantined && !b.isQuarantined) {
                const isTransmission = (a.canTransmit() && b.canBeInfected()) || (b.canTransmit() && a.canBeInfected());
                this.ctx.strokeStyle = isTransmission ? '#F44336' : '#cccccc';
                this.ctx.lineWidth = a.connections.length > 4 || b.connections.length > 4 ? 2 : 1;
                
                this.ctx.beginPath();
                this.ctx.moveTo(a.x, a.y);
                const midX = (a.x + b.x) / 2;
                const midY = (a.y + b.y) / 2 + Math.sin(Date.now() / 1000) * 2;
                this.ctx.quadraticCurveTo(midX, midY, b.x, b.y);
                this.ctx.stroke();
            }
        });
    }
    drawNodes(network) {
        network.nodes.forEach(node => {
            if (!node.isQuarantined) {
                this.drawNode(node);
            }
        });
        // Reset globalAlpha in case quarantine changed it
        this.ctx.globalAlpha = 1.0;
    }


    drawNode(node) {
        const radius = 8;
        let color = gameData.node_states[node.state].color;
        
        if (node.isVaccinated && node.state === 'susceptible') {
            color = gameData.node_states.vaccinated.color;
        }
        if (node.isQuarantined) {
            color = gameData.node_states.quarantined.color;
            this.ctx.globalAlpha = 0.5;
        }

        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
        this.ctx.fill();

        if (node.state === 'infectious') {
            this.ctx.strokeStyle = '#F44336';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, radius + Math.sin(Date.now() / 200) * 2, 0, 2 * Math.PI);
            this.ctx.stroke();
        }

        if (node.isVaccinated) {
            this.ctx.strokeStyle = '#4CAF50';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, radius + 3, 0, 2 * Math.PI);
            this.ctx.stroke();
        }

        if (node.isTested) {
            this.ctx.strokeStyle = '#2196F3';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
            this.ctx.stroke();
        }

        if (node.riskLevel === 'high') {
            this.ctx.strokeStyle = '#FF9800';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, radius + 2, 0, 2 * Math.PI);
            this.ctx.stroke();
        }

        const animation = this.animations.get(node.id);
        if (animation) {
            const progress = (Date.now() - animation.startTime) / animation.duration;
            if (progress < 1) {
                this.ctx.strokeStyle = animation.type === 'vaccinate' ? '#4CAF50' : '#F44336';
                this.ctx.lineWidth = 2;
                this.ctx.globalAlpha = 1 - progress;
                this.ctx.beginPath();
                this.ctx.arc(node.x, node.y, radius + progress * 10, 0, 2 * Math.PI);
                this.ctx.stroke();
            } else {
                this.animations.delete(node.id);
            }
        }

        this.ctx.globalAlpha = 1;
    }

    highlightNode(node) {
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, 12, 0, 2 * Math.PI);
        this.ctx.stroke();
    }

    getNodeAtPosition(x, y, network) {
        const rect = this.canvas.getBoundingClientRect();
        const canvasX = x - rect.left;
        const canvasY = y - rect.top;

        for (let node of network.nodes) {
            const distance = Math.sqrt((node.x - canvasX) ** 2 + (node.y - canvasY) ** 2);
            if (distance <= 12) {
                return node;
            }
        }
        return null;
    }
}

// Progress chart renderer
class ProgressChart {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
    }

    render(dailyStats) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (dailyStats.length === 0) return;

        const maxCases = Math.max(...dailyStats.map(day => 
            day.exposed + day.infectious + day.recovered + day.dead
        ));
        
        if (maxCases === 0) return;

        const width = this.canvas.width - 40;
        const height = this.canvas.height - 40;
        const stepX = width / Math.max(dailyStats.length - 1, 1);

        this.ctx.strokeStyle = '#666';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(20, height + 20);
        this.ctx.lineTo(width + 20, height + 20);
        this.ctx.moveTo(20, 20);
        this.ctx.lineTo(20, height + 20);
        this.ctx.stroke();

        const colors = {
            exposed: '#FFC107',
            infectious: '#F44336',
            recovered: '#4CAF50',
            dead: '#000000'
        };

        Object.keys(colors).forEach(state => {
            this.ctx.strokeStyle = colors[state];
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            
            dailyStats.forEach((day, index) => {
                const x = 20 + index * stepX;
                const y = height + 20 - (day[state] / maxCases) * height;
                
                if (index === 0) {
                    this.ctx.moveTo(x, y);
                } else {
                    this.ctx.lineTo(x, y);
                }
            });
            
            this.ctx.stroke();
        });
    }
}

// Global game state
const gameState = new GameState();
let canvas, particleCanvas, renderer, particleSystem, progressChart;

// Initialize the game
function initGame() {
    canvas = document.getElementById('network-canvas');
    particleCanvas = document.getElementById('particle-canvas');
    renderer = new CanvasRenderer(canvas);
    particleSystem = new ParticleSystem(particleCanvas);
    progressChart = new ProgressChart(document.getElementById('progress-chart'));
    
    setupEventListeners();
    showScreen('title');
    animate();
}

function animate() {
    particleSystem.update();
    particleSystem.render();
    if (gameState.currentScreen === 'game') {
        renderer.render(gameState.network);
    }
    requestAnimationFrame(animate);
}

function setupEventListeners() {
    document.querySelectorAll('.scenario-card').forEach(card => {
        card.addEventListener('click', () => {
            const scenarioIndex = parseInt(card.dataset.scenario);
            startScenario(scenarioIndex);
        });
    });

    document.getElementById('play-btn').addEventListener('click', () => {
        gameState.isRunning = true;
        startSimulation();
        addLogEntry(gameState.language === 'en' ? 'Simulation started' : 'Simulación iniciada');
    });

    document.getElementById('pause-btn').addEventListener('click', () => {
        gameState.isRunning = false;
        if (gameState.gameTimer) {
            clearInterval(gameState.gameTimer);
            gameState.gameTimer = null;
        }
        addLogEntry(gameState.language === 'en' ? 'Simulation paused' : 'Simulación pausada');
    });

    document.getElementById('fast-btn').addEventListener('click', () => {
        gameState.speed = 200;
        if (gameState.isRunning) {
            startSimulation();
        }
        addLogEntry(gameState.language === 'en' ? 'Simulation speed increased' : 'Velocidad de simulación aumentada');
    });

    document.querySelectorAll('.tool-item').forEach(tool => {
        tool.addEventListener('click', () => {
            const toolType = tool.dataset.tool;
            selectTool(toolType);
        });
        tool.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('tool', tool.dataset.tool);
        });
    });

    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    canvas.addEventListener('dragover', (e) => e.preventDefault());
    canvas.addEventListener('drop', handleCanvasDrop);

    document.getElementById('replay-btn').addEventListener('click', () => {
        if (gameState.selectedScenario !== null) {
            startScenario(gameState.selectedScenario);
        }
    });

    document.getElementById('new-scenario-btn').addEventListener('click', () => {
        showScreen('title');
    });

    document.getElementById('toggle-high-contrast').addEventListener('click', () => {
        document.documentElement.dataset.colorScheme = 
            document.documentElement.dataset.colorScheme === 'high-contrast' ? 'light' : 'high-contrast';
    });

    document.getElementById('toggle-language').addEventListener('click', () => {
        gameState.language = gameState.language === 'en' ? 'es' : 'en';
        updateUI();
    });

    document.getElementById('simulation-speed').addEventListener('input', (e) => {
        gameState.speed = 1000 / e.target.value;
        if (gameState.isRunning) {
            startSimulation();
        }
    });

    document.querySelector('.toggle-tools').addEventListener('click', () => {
        document.querySelector('.tools-panel').classList.toggle('collapsed');
    });

    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        if (gameState.currentScreen !== 'game') return;
        const tools = ['vaccinate', 'quarantine', 'test', 'contact_trace', 'sever_link'];
        if (e.key >= '1' && e.key <= '5') {
            selectTool(tools[parseInt(e.key) - 1]);
        }
        if (e.key === 'Enter' && gameState.selectedNode !== null) {
            const node = gameState.network.nodes.find(n => n.id === gameState.selectedNode);
            if (node && gameState.selectedTool) {
                useTool(gameState.selectedTool, node);
            }
        }

/* ---------- Minimal Interaction Stubs --------------------- */
/**
 * Handle clicks on the network canvas. Currently just logs the clicked
 * location.  Replace with real game‑logic later.
 */
function handleCanvasClick(evt){
    // Convert mouse coordinates to canvas coordinates if needed.
    // For now just deselect any node that might have been selected
    gameState.selectedNode = null;
}

/**
 * Live feedback on mouse move (e.g. highlighting nodes).
 * For now it does nothing but is required so the game boots.
 */
function handleCanvasMouseMove(evt){
    /* intentionally blank – implement highlighting later */
}

/**
 * Accept a dropped tool dragged from the toolbox on to a node.
 * For now consume the event so the browser won’t redirect.
 */
function handleCanvasDrop(evt){
    evt.preventDefault();
    /* implement drag‑n‑drop interactions here later */
}

/**
 * Remember the user’s currently selected intervention tool.
 */
function selectTool(toolType){
    gameState.selectedTool = toolType;
    addLogEntry(`Tool selected: ${toolType}`);
}

/**
 * Apply an intervention tool to a node. Placeholder so that key‑bindings
 * in setupEventListeners don’t fail.
 */
function useTool(toolType, node){
    addLogEntry(`Pretend to use ${toolType} on node #${node.id}`);
}
/* ---------------------------------------------------------- */

    });
}

function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.add('hidden');
    });
    document.getElementById(`${screenName}-screen`).classList.remove('hidden');
    gameState.currentScreen = screenName;
}

function startScenario(scenarioIndex) {
    gameState.selectedScenario = scenarioIndex;
    gameState.scenario = gameData.scenarios[scenarioIndex];
    gameState.reset();

    gameState.tools = { ...gameState.scenario.tools };

    const networkType = gameState.scenario.network_type;
    const population = gameState.scenario.population;

    if (networkType === 'scale-free') {
        gameState.network = NetworkGenerator.generateScaleFree(population);
    } else if (networkType === 'small-world') {
        gameState.network = NetworkGenerator.generateSmallWorld(population);
    } else if (networkType === 'random') {
        gameState.network = NetworkGenerator.generateRandom(population);
    }

    const diseaseParams = gameData.epidemiological_parameters[gameState.scenario.disease];
    for (let i = 0; i < gameState.scenario.initial_cases; i++) {
        const randomNode = gameState.network.nodes[Math.floor(Math.random() * population)];
        if (randomNode.state === 'susceptible') {
            randomNode.setState('exposed');
        }
    }

    showScreen('game');
    updateStatistics();
    updateUI();
    renderer.render(gameState.network);
    addLogEntry(gameState.language === 'en' ? 
        `${gameState.scenario.name} scenario loaded - ${population} population, ${gameState.scenario.initial_cases} initial cases.` :
        `Escenario ${gameState.scenario.name} cargado - ${population} personas, ${gameState.scenario.initial_cases} casos iniciales.`);
}


/* ---------- Helper Functions Added to Fix Rendering -------------- */
/**
 * Recalculate global statistics and update the dashboard values.
 */
function updateStatistics() {
    if (!gameState.network || !gameState.network.nodes) return;
    const counts = {
        susceptible: 0, exposed: 0, infectious: 0,
        recovered: 0, vaccinated: 0, quarantined: 0, dead: 0
    };

    gameState.network.nodes.forEach(node => {
        if (counts.hasOwnProperty(node.state)) {
            counts[node.state]++;
        }
        if (node.isVaccinated) counts.vaccinated++;
        if (node.isQuarantined) counts.quarantined++;
    });

    // Persist in gameState
    Object.assign(gameState.statistics, counts);

    // HUD – only update if the element exists
    const el = (id) => document.getElementById(id);
    if (el('stat-susceptible')) el('stat-susceptible').textContent = counts.susceptible;
    if (el('stat-exposed'))     el('stat-exposed').textContent     = counts.exposed;
    if (el('stat-infectious'))  el('stat-infectious').textContent  = counts.infectious;
    if (el('stat-recovered'))   el('stat-recovered').textContent   = counts.recovered;
    if (el('current-day'))      el('current-day').textContent      = gameState.currentDay;
}

/**
 * Refresh top‑panel info (scenario title, description, objective)
 * and the tool counters in the toolbox.
 */
function updateUI() {
    if (!gameState.scenario) return;

    const el = (id) => document.getElementById(id);
    if (el('current-scenario'))     el('current-scenario').textContent     = gameState.scenario.name;
    if (el('scenario-description')) el('scenario-description').textContent = gameState.scenario.description;
    if (el('scenario-objective'))   el('scenario-objective').textContent   = `Objective: ${gameState.scenario.objective}`;

    // Update available intervention counts
    const toolIds = {
        vaccinate: 'vaccinate-count',
        quarantine: 'quarantine-count',
        test: 'test-count',
        contact_trace: 'contact-trace-count',
        sever_link: 'sever-link-count'
    };
    Object.entries(toolIds).forEach(([toolKey, spanId]) => {
        if (el(spanId) && gameState.tools && gameState.tools.hasOwnProperty(toolKey)) {
            el(spanId).textContent = gameState.tools[toolKey];
        }
    });
}

/**
 * Append a line to the in‑game action log and keep it scrolled to bottom.
 * @param {string} message – already localised text to display.
 */
function addLogEntry(message) {
    const logContainer = document.getElementById('log-content');
    if (!logContainer) return;
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = message;
    logContainer.appendChild(entry);
    // Auto‑scroll
    logContainer.scrollTop = logContainer.scrollHeight;
}
/* ---------------------------------------------------------------- */

// Make sure initGame is called when the window loads
window.addEventListener('load', initGame);