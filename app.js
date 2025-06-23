// Constants
const INFECTION_CHANCE_EASY = 0.3;
const INFECTION_CHANCE_NORMAL = 0.5;
const INFECTION_CHANCE_HARD = 0.7;
const ANIMATION_DURATION = 300;
const PING_ANIMATION_DURATION = 800;
const QUARANTINE_AVAILABLE_DAY = 5;
const MAX_DAYS = 14;

// Game data
const gameData = {
  scenarios: [
    {
      id: "urban",
      name: "Urban Neighborhood Outbreak",
      description: "You are Dr. Alex Chen, Senior Epidemiologist at Metro Health Department. A mysterious respiratory illness has emerged in the Riverside neighborhood, an area with historically low vaccination rates. Your role is to investigate the outbreak, implement control measures, and protect the community while maintaining public trust.",
      background: "Day 1: Reports of unusual flu-like symptoms in a densely populated urban area. Initial contact tracing suggests the outbreak began at a community center. You must act quickly to prevent widespread transmission.",
      networkType: "scale-free",
      initialInfected: 2,
      resources: {
        vaccines: {easy: 15, normal: 10, hard: 7},
        quarantine: {easy: 12, normal: 8, hard: 5}
      }
    },
    {
      id: "school",
      name: "School Reopening Crisis",
      description: "You are Chief Health Consultant for Metropolitan School District. As schools reopen, flu-like symptoms are appearing among students and staff. Your challenge is balancing educational continuity with public health protection.",
      background: "Day 1: The first week back to school has brought concerning reports. Several students in different grades are showing symptoms. The school board is pressuring you to keep schools open while parents demand safety measures.",
      networkType: "small-world",
      initialInfected: 3,
      resources: {
        vaccines: {easy: 18, normal: 12, hard: 8},
        quarantine: {easy: 10, normal: 6, hard: 4}
      }
    },
    {
      id: "festival",
      name: "Music Festival Outbreak",
      description: "You are County Health Director managing a potential outbreak among 50,000 festival attendees. A highly transmissible variant has been detected, and you must prevent a multi-state outbreak while the event continues.",
      background: "Day 1: The annual Summer Music Festival is underway. Initial cases have been identified among attendees from multiple states. You have limited time and resources to prevent this from becoming a superspreader event.",
      networkType: "random",
      initialInfected: 4,
      resources: {
        vaccines: {easy: 20, normal: 15, hard: 10},
        quarantine: {easy: 15, normal: 10, hard: 6}
      }
    },
    {
      id: "care_facility",
      name: "Long-term Care Facility",
      description: "You are Regional Health Coordinator specializing in protecting vulnerable populations. An outbreak has been detected in Sunset Manor nursing home. Your priority is protecting elderly residents while maintaining their quality of life.",
      background: "Day 1: A staff member at Sunset Manor has tested positive. With 50 elderly residents, this situation requires immediate but careful intervention. Families are worried, and the facility administration needs clear guidance.",
      networkType: "small-world",
      initialInfected: 1,
      resources: {
        vaccines: {easy: 25, normal: 20, hard: 15},
        quarantine: {easy: 8, normal: 5, hard: 3}
      }
    },
    {
      id: "airport",
      name: "International Airport Hub",
      description: "You are State Epidemiologist coordinating with CDC and international partners. A new variant has been detected among international travelers at Metro International Airport. Your goal is preventing pandemic spread through major transportation networks.",
      background: "Day 1: Multiple cases of a concerning new variant have been identified among passengers from various international flights. The airport remains operational, but you must implement rapid containment strategies to prevent global spread.",
      networkType: "scale-free",
      initialInfected: 3,
      resources: {
        vaccines: {easy: 12, normal: 8, hard: 5},
        quarantine: {easy: 20, normal: 15, hard: 10}
      }
    }
  ],
  tools: [
    {
      id: "vaccines",
      name: "💉 Vaccinate",
      description: "Prevents infection and transmission. Use on highly connected individuals for maximum impact.",
      effect: "Prevents infection and stops transmission through this node."
    },
    {
      id: "quarantine", 
      name: "🚫 Quarantine",
      description: "Removes person from network entirely. Available starting day 5-7 depending on scenario.",
      effect: "Completely isolates individual, removing them and all connections from the network."
    }
  ]
};

// Day narratives
const dayNarratives = {
  1: "The outbreak has begun. Use your tools wisely to contain the spread.",
  2: "Cases are being reported. Focus on protecting key network members.",
  3: "The situation is developing. Monitor transmission patterns carefully.",
  4: "Public concern is growing. Your interventions are being watched closely.",
  5: "Quarantine measures are now available. Consider isolation strategies.",
  6: "Community transmission is evident. Time is critical.",
  7: "Media attention is intense. Balance public health with community trust.",
  8: "Half way through the crisis. Evaluate your strategy.",
  9: "Resources are becoming limited. Prioritize your remaining tools.",
  10: "The outbreak's trajectory is becoming clear.",
  11: "Long-term impacts are being considered.",
  12: "Community resilience is being tested.",
  13: "The crisis is nearing its peak.",
  14: "Final day. Your decisions will determine the outcome."
};

// Game state
let gameState = {
  currentScenario: null,
  difficulty: 'normal',
  currentDay: 1,
  resources: {},
  nodes: [],
  links: [],
  selectedTool: null,
  actionHistory: [],
  quarantinedNodes: 0,
  isGameOver: false
};

// D3 visualization variables
let svg, simulation, nodeElements, linkElements, width, height;

// Utility functions
function getInfectionChance() {
  switch(gameState.difficulty) {
    case 'easy': return INFECTION_CHANCE_EASY;
    case 'hard': return INFECTION_CHANCE_HARD;
    default: return INFECTION_CHANCE_NORMAL;
  }
}

function generateNetwork(type, nodeCount = 50) {
  const nodes = [];
  const links = [];
  
  // Create nodes
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({
      id: i,
      state: 'healthy',
      wasUsedTool: false,
      connections: 0
    });
  }
  
  // Generate links based on network type
  switch(type) {
    case 'scale-free':
      generateScaleFreeNetwork(nodes, links);
      break;
    case 'small-world':
      generateSmallWorldNetwork(nodes, links);
      break;
    case 'random':
      generateRandomNetwork(nodes, links);
      break;
  }
  
  // Count connections for each node
  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    
    // Find the nodes in the array
    const sourceNode = nodes.find(n => n.id === sourceId);
    const targetNode = nodes.find(n => n.id === targetId);
    
    if (sourceNode) sourceNode.connections = (sourceNode.connections || 0) + 1;
    if (targetNode) targetNode.connections = (targetNode.connections || 0) + 1;
  }
  
  return { nodes, links };
}

function generateScaleFreeNetwork(nodes, links) {
  const nodeCount = nodes.length;
  
  // Start with a small connected network
  for (let i = 0; i < 3 && i < nodeCount; i++) {
    for (let j = i + 1; j < 3 && j < nodeCount; j++) {
      links.push({ source: i, target: j });
    }
  }
  
  // Add preferential attachment for remaining nodes
  for (let i = 3; i < nodeCount; i++) {
    const numConnections = Math.min(3, i);
    
    for (let j = 0; j < numConnections; j++) {
      // Select a target node with probability proportional to its degree
      let targetIdx = Math.floor(Math.random() * i);
      links.push({ source: i, target: targetIdx });
    }
  }
}

function generateSmallWorldNetwork(nodes, links) {
  const nodeCount = nodes.length;
  const k = 4; // Each node connects to k nearest neighbors
  const p = 0.1; // Rewiring probability
  
  // Create ring lattice
  for (let i = 0; i < nodeCount; i++) {
    for (let j = 1; j <= k/2; j++) {
      links.push({ source: i, target: (i+j) % nodeCount });
    }
  }
  
  // Rewire edges randomly with probability p
  for (let i = 0; i < links.length; i++) {
    if (Math.random() < p) {
      links[i].target = Math.floor(Math.random() * nodeCount);
    }
  }
}

function generateRandomNetwork(nodes, links) {
  const nodeCount = nodes.length;
  const p = 0.1; // Connection probability
  
  for (let i = 0; i < nodeCount; i++) {
    for (let j = i + 1; j < nodeCount; j++) {
      if (Math.random() < p) {
        links.push({ source: i, target: j });
      }
    }
  }
}

function initializeGame(scenarioId, difficulty) {
  gameState.currentScenario = gameData.scenarios.find(s => s.id === scenarioId);
  gameState.difficulty = difficulty;
  gameState.currentDay = 1;
  gameState.actionHistory = [];
  gameState.quarantinedNodes = 0;
  gameState.isGameOver = false;
  gameState.selectedTool = null;
  
  // Set resources based on difficulty
  const scenario = gameState.currentScenario;
  gameState.resources = {
    vaccines: scenario.resources.vaccines[difficulty],
    quarantine: scenario.resources.quarantine[difficulty]
  };
  
  // Generate network
  const network = generateNetwork(scenario.networkType);
  gameState.nodes = network.nodes;
  gameState.links = network.links;
  
  // Set initial infected nodes
  const infectedCount = scenario.initialInfected;
  for (let i = 0; i < infectedCount && i < gameState.nodes.length; i++) {
    gameState.nodes[i].state = 'infected';
  }
  
  updateUI();
  initializeVisualization();
  updateProgressDashboard();
  updateDayNarrative();
}

function initializeVisualization() {
  const container = document.getElementById('network-viz');
  container.innerHTML = '';
  
  width = container.clientWidth;
  height = container.clientHeight;
  
  svg = d3.select('#network-viz')
    .append('svg')
    .attr('width', width)
    .attr('height', height);
  
  // Create groups for links and nodes
  svg.append('g').attr('class', 'links');
  svg.append('g').attr('class', 'nodes');
  svg.append('g').attr('class', 'overlays');
  
  // Initialize force simulation
  simulation = d3.forceSimulation(gameState.nodes)
    .force('link', d3.forceLink(gameState.links).id(d => d.id).distance(30))
    .force('charge', d3.forceManyBody().strength(-100))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(15));
  
  updateVisualization();
}

function updateVisualization() {
  // Update links
  linkElements = svg.select('.links')
    .selectAll('line')
    .data(gameState.links, d => `${d.source.id}-${d.target.id}`)
    .join(
      enter => enter.append('line')
        .attr('class', 'link')
        .attr('stroke', '#777')
        .attr('stroke-opacity', 0.6)
        .attr('stroke-width', 1),
      update => update,
      exit => exit.remove()
    );
  
  // Update nodes
  nodeElements = svg.select('.nodes')
    .selectAll('circle')
    .data(gameState.nodes, d => d.id)
    .join(
      enter => enter.append('circle')
        .attr('class', d => `node ${d.state}`)
        .attr('r', d => Math.max(8, Math.min(15, 8 + (d.connections || 0) * 0.5)))
        .attr('fill', d => getNodeColor(d.state))
        .attr('stroke', d => getNodeStrokeColor(d.state))
        .attr('stroke-width', 2)
        .style('cursor', 'pointer')
        .on('click', handleNodeClick)
        .on('mouseover', handleNodeMouseover)
        .on('mouseout', handleNodeMouseout)
        .call(enter => enter.transition()
          .duration(ANIMATION_DURATION)
          .attr('r', d => Math.max(8, Math.min(15, 8 + (d.connections || 0) * 0.5)))),
      update => update
        .attr('class', d => `node ${d.state}`)
        .attr('fill', d => getNodeColor(d.state))
        .attr('stroke', d => getNodeStrokeColor(d.state)),
      exit => exit.remove()
    );
  
  // Add vaccination checkmarks
  svg.select('.overlays')
    .selectAll('text')
    .data(gameState.nodes.filter(d => d.state === 'vaccinated'), d => d.id)
    .join(
      enter => enter.append('text')
        .attr('class', 'vaccination-check')
        .text('✓')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .attr('fill', 'white')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('pointer-events', 'none'),
      update => update,
      exit => exit.remove()
    );
  
  // Update simulation
  simulation.nodes(gameState.nodes);
  simulation.force('link').links(gameState.links);
  simulation.alpha(0.3).restart();
  
  simulation.on('tick', () => {
    linkElements
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);
    
    nodeElements
      .attr('cx', d => d.x)
      .attr('cy', d => d.y);
    
    svg.select('.overlays')
      .selectAll('text')
      .attr('x', d => d.x)
      .attr('y', d => d.y);
  });
}

function getNodeColor(state) {
  const colors = {
    healthy: '#0072B2',
    vaccinated: '#009E73',
    infected: '#D55E00',
    exposed: '#CC79A7',
    quarantined: '#F0E442'
  };
  return colors[state] || colors.healthy;
}

function getNodeStrokeColor(state) {
  const colors = {
    healthy: '#005a8b',
    vaccinated: '#007a5a',
    infected: '#b04400',
    exposed: '#a85d84',
    quarantined: '#d4c635'
  };
  return colors[state] || colors.healthy;
}

function handleNodeClick(event, node) {
  if (gameState.isGameOver || !gameState.selectedTool) return;
  
  useTool(gameState.selectedTool, node);
}

function handleNodeMouseover(event, node) {
  d3.select(event.currentTarget)
    .attr('stroke-width', 3)
    .style('filter', 'brightness(1.1)');
}

function handleNodeMouseout(event, node) {
  d3.select(event.currentTarget)
    .attr('stroke-width', 2)
    .style('filter', 'none');
}

function useTool(toolId, node) {
  if (gameState.resources[toolId] <= 0) return;
  if (node.wasUsedTool) return;
  
  // Save action for undo
  gameState.actionHistory = [{
    type: toolId,
    nodeId: node.id,
    previousState: node.state,
    wasUsedTool: node.wasUsedTool
  }];
  
  switch(toolId) {
    case 'vaccines':
      if (node.state === 'healthy' || node.state === 'exposed') {
        node.state = 'vaccinated';
        node.wasUsedTool = true;
        gameState.resources.vaccines--;
        animateVaccination(node);
      }
      break;
      
    case 'quarantine':
      if (gameState.currentDay >= QUARANTINE_AVAILABLE_DAY) {
        node.wasUsedTool = true;
        gameState.resources.quarantine--;
        quarantineNode(node);
      }
      break;
  }
  
  updateUI();
  updateVisualization();
  updateProgressDashboard();
  checkGameEnd();
}

function quarantineNode(node) {
  // Add fade out animation
  const nodeElement = svg.select('.nodes')
    .selectAll('circle')
    .filter(d => d.id === node.id);
  
  nodeElement.classed('fade-out', true);
  
  setTimeout(() => {
    // Remove node from gameState.nodes
    const nodeIndex = gameState.nodes.findIndex(n => n.id === node.id);
    if (nodeIndex !== -1) {
      gameState.nodes.splice(nodeIndex, 1);
    }
    
    // Remove all links connected to this node
    gameState.links = gameState.links.filter(link => 
      link.source.id !== node.id && link.target.id !== node.id
    );
    
    gameState.quarantinedNodes++;
    
    // Re-render visualization
    updateVisualization();
    updateProgressDashboard();
  }, ANIMATION_DURATION);
}

function animateVaccination(node) {
  // Create ping animation
  const ping = svg.select('.overlays')
    .append('circle')
    .attr('cx', node.x)
    .attr('cy', node.y)
    .attr('r', 8)
    .attr('fill', 'none')
    .attr('stroke', '#009E73')
    .attr('stroke-width', 2)
    .attr('opacity', 1)
    .attr('class', 'ping-animation');
  
  ping.transition()
    .duration(PING_ANIMATION_DURATION)
    .attr('r', 25)
    .attr('opacity', 0)
    .remove();
}

function undoLastAction() {
  if (gameState.actionHistory.length === 0) return;
  
  const lastAction = gameState.actionHistory.pop();
  
  if (lastAction.type === 'quarantine') {
    // Cannot undo quarantine as node is removed
    return;
  }
  
  // Find the node and restore its state
  const node = gameState.nodes.find(n => n.id === lastAction.nodeId);
  if (node) {
    node.state = lastAction.previousState;
    node.wasUsedTool = lastAction.wasUsedTool;
    gameState.resources[lastAction.type]++;
    
    updateUI();
    updateVisualization();
    updateProgressDashboard();
  }
}

function simulateSpread() {
  const newExposed = [];
  const newInfected = [];
  
  // Find all infected nodes
  const infectedNodes = gameState.nodes.filter(n => n.state === 'infected');
  
  infectedNodes.forEach(infectedNode => {
    // Find connected healthy nodes
    const connectedLinks = gameState.links.filter(link => 
      (link.source.id === infectedNode.id || link.target.id === infectedNode.id)
    );
    
    connectedLinks.forEach(link => {
      const connectedNodeId = link.source.id === infectedNode.id ? 
        link.target.id : link.source.id;
      const connectedNode = gameState.nodes.find(n => n.id === connectedNodeId);
      
      if (connectedNode && connectedNode.state === 'healthy') {
        if (Math.random() < getInfectionChance()) {
          connectedNode.state = 'exposed';
          newExposed.push(connectedNode);
        }
      }
    });
  });
  
  // Convert exposed to infected
  const exposedNodes = gameState.nodes.filter(n => n.state === 'exposed');
  exposedNodes.forEach(node => {
    if (Math.random() < 0.7) { // 70% chance exposed becomes infected
      node.state = 'infected';
      newInfected.push(node);
    }
  });
  
  return { newExposed, newInfected };
}

function nextDay() {
  if (gameState.isGameOver) return;
  
  gameState.currentDay++;
  gameState.actionHistory = []; // Clear undo history
  
  // Simulate disease spread
  const spreadResult = simulateSpread();
  
  updateUI();
  updateVisualization();
  updateProgressDashboard();
  updateDayNarrative();
  checkGameEnd();
}

function updateDayNarrative() {
  const narrativeElement = document.getElementById('day-narrative');
  
  narrativeElement.innerHTML = `
    <h4>Day ${gameState.currentDay}</h4>
    <p>${dayNarratives[gameState.currentDay] || "Continue monitoring the situation."}</p>
  `;
}

function checkGameEnd() {
  // Don't check for game over if we haven't started yet
  if (!gameState.currentScenario) return;
  
  const infectedCount = gameState.nodes.filter(n => n.state === 'infected').length;
  const exposedCount = gameState.nodes.filter(n => n.state === 'exposed').length;
  const totalActiveCount = infectedCount + exposedCount;
  const totalNodes = gameState.nodes.length + gameState.quarantinedNodes;
  
  let gameOver = false;
  let result = '';
  
  if (totalActiveCount === 0) {
    gameOver = true;
    result = 'Victory! You successfully contained the outbreak.';
  } else if (gameState.currentDay >= MAX_DAYS) {
    gameOver = true;
    if (totalActiveCount < totalNodes * 0.1) {
      result = 'Partial Success. The outbreak was mostly contained.';
    } else {
      result = 'The outbreak was not fully contained. Review your strategy.';
    }
  } else if (totalActiveCount > totalNodes * 0.5) {
    gameOver = true;
    result = 'Outbreak spread too widely. Better luck next time.';
  }
  
  if (gameOver) {
    gameState.isGameOver = true;
    showGameOverModal(result);
  }
}

function showGameOverModal(result) {
  const modal = document.getElementById('game-over-modal');
  const resultElement = document.getElementById('game-result');
  const statsElement = document.getElementById('game-stats');
  
  const vaccinated = gameState.nodes.filter(n => n.state === 'vaccinated').length;
  const infected = gameState.nodes.filter(n => n.state === 'infected').length;
  const healthy = gameState.nodes.filter(n => n.state === 'healthy').length;
  
  resultElement.textContent = result;
  statsElement.innerHTML = `
    <div class="status status--info">Day ${gameState.currentDay} of ${MAX_DAYS}</div>
    <p><strong>Final Statistics:</strong></p>
    <ul>
      <li>🟢 Vaccinated: ${vaccinated}</li>
      <li>💀 Infected: ${infected}</li>
      <li>🔵 Healthy: ${healthy}</li>
      <li>🚫 Quarantined: ${gameState.quarantinedNodes}</li>
    </ul>
  `;
  
  modal.classList.remove('hidden');
}

function updateUI() {
  // Update tool counts
  document.getElementById('vaccines-count').textContent = gameState.resources.vaccines;
  document.getElementById('quarantine-count').textContent = gameState.resources.quarantine;
  
  // Update day counter
  document.getElementById('current-day').textContent = gameState.currentDay;
  
  // Update scenario info
  if (gameState.currentScenario) {
    document.getElementById('scenario-title').textContent = gameState.currentScenario.name;
    document.getElementById('scenario-description').textContent = gameState.currentScenario.description;
    document.getElementById('scenario-background').textContent = gameState.currentScenario.background;
  }
  
  // Update tool availability
  const quarantineBtn = document.querySelector('.tool-quarantine');
  if (gameState.currentDay < QUARANTINE_AVAILABLE_DAY) {
    quarantineBtn.classList.add('disabled');
  } else {
    quarantineBtn.classList.remove('disabled');
  }
}

function updateProgressDashboard() {
  const infected = gameState.nodes.filter(n => n.state === 'infected' || n.state === 'exposed').length;
  const vaccinated = gameState.nodes.filter(n => n.state === 'vaccinated').length;
  
  document.getElementById('infected-count').textContent = infected;
  document.getElementById('vaccinated-count').textContent = vaccinated;
  document.getElementById('quarantined-count').textContent = gameState.quarantinedNodes;
  document.getElementById('days-elapsed').textContent = gameState.currentDay;
}

// Tutorial system
function showTutorial() {
  if (localStorage.getItem('vax-tutorial-completed')) {
    return;
  }
  
  const tutorialSteps = [
    {
      target: '.tool-vaccines',
      title: 'Vaccination Tool',
      content: 'Click on this tool, then click on network members to vaccinate them. Focus on highly connected individuals for maximum impact.',
      position: 'right'
    },
    {
      target: '.tool-quarantine',
      title: 'Quarantine Tool',
      content: 'Use this tool to isolate infected individuals, removing them from the network entirely. Available after day 5.',
      position: 'right'
    },
    {
      target: '.next-day-btn',
      title: 'Day Progression',
      content: 'Click here to advance to the next day and see how the outbreak evolves. Watch for animated disease spread!',
      position: 'top'
    }
  ];
  
  let currentStep = 0;
  const overlay = document.getElementById('tutorial-overlay');
  const highlight = document.querySelector('.tutorial-highlight');
  const tooltip = document.querySelector('.tutorial-tooltip');
  const title = document.getElementById('tutorial-title');
  const text = document.getElementById('tutorial-text');
  const nextBtn = document.getElementById('tutorial-next');
  const skipBtn = document.getElementById('tutorial-skip');
  
  function showStep(step) {
    const targetElement = document.querySelector(tutorialSteps[step].target);
    if (!targetElement) return;
    
    const rect = targetElement.getBoundingClientRect();
    highlight.style.left = (rect.left - 10) + 'px';
    highlight.style.top = (rect.top - 10) + 'px';
    highlight.style.width = (rect.width + 20) + 'px';
    highlight.style.height = (rect.height + 20) + 'px';
    
    // Position tooltip
    const tooltipRect = tooltip.getBoundingClientRect();
    let tooltipX = rect.right + 20;
    let tooltipY = rect.top;
    
    if (tutorialSteps[step].position === 'top') {
      tooltipX = rect.left;
      tooltipY = rect.top - tooltipRect.height - 20;
    }
    
    tooltip.style.left = tooltipX + 'px';
    tooltip.style.top = tooltipY + 'px';
    
    title.textContent = tutorialSteps[step].title;
    text.textContent = tutorialSteps[step].content;
    
    nextBtn.textContent = step === tutorialSteps.length - 1 ? 'Finish' : 'Next';
  }
  
  function nextStep() {
    currentStep++;
    if (currentStep >= tutorialSteps.length) {
      closeTutorial();
    } else {
      showStep(currentStep);
    }
  }
  
  function closeTutorial() {
    overlay.classList.add('hidden');
    localStorage.setItem('vax-tutorial-completed', 'true');
  }
  
  nextBtn.onclick = nextStep;
  skipBtn.onclick = closeTutorial;
  
  overlay.classList.remove('hidden');
  showStep(0);
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
  // Make sure the game over modal is hidden on startup
  document.getElementById('game-over-modal').classList.add('hidden');
  
  // Initialize with difficulty overlay visible
  document.getElementById('difficulty-overlay').classList.remove('hidden');
  document.getElementById('scenario-selection').classList.add('hidden');
  document.getElementById('game-interface').classList.add('hidden');
  document.getElementById('progress-dashboard').classList.add('hidden');
  
  // Difficulty selection
  document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const difficulty = this.dataset.difficulty;
      gameState.difficulty = difficulty;
      document.getElementById('difficulty-overlay').classList.add('hidden');
      document.getElementById('scenario-selection').classList.remove('hidden');
    });
  });
  
  // Scenario selection
  document.querySelectorAll('.scenario-card').forEach(card => {
    card.addEventListener('click', function() {
      const scenarioId = this.dataset.scenario;
      document.getElementById('scenario-selection').classList.add('hidden');
      document.getElementById('game-interface').classList.remove('hidden');
      document.getElementById('progress-dashboard').classList.remove('hidden');
      
      initializeGame(scenarioId, gameState.difficulty);
      
      // Show tutorial for first-time users
      setTimeout(() => showTutorial(), 1000);
    });
  });
  
  // Tool selection
  document.querySelectorAll('.tool-button').forEach(btn => {
    btn.addEventListener('click', function() {
      if (this.classList.contains('disabled')) return;
      
      document.querySelectorAll('.tool-button').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      
      gameState.selectedTool = this.dataset.tool;
      
      const tool = gameData.tools.find(t => t.id === gameState.selectedTool);
      document.getElementById('tool-description').textContent = tool ? tool.description : '';
    });
  });
  
  // Next day button
  document.getElementById('next-day').addEventListener('click', nextDay);
  
  // Restart button
  document.getElementById('restart-game').addEventListener('click', function() {
    location.reload();
  });
  
  // Play again button
  document.getElementById('play-again').addEventListener('click', function() {
    document.getElementById('game-over-modal').classList.add('hidden');
    location.reload();
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    if (e.key === 'z' || e.key === 'Z') {
      undoLastAction();
    } else if (e.key === 'Enter') {
      if (!gameState.isGameOver) {
        nextDay();
      }
    }
  });
});