
// ... (Everything up to and including startScenario stays unchanged)

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

// Make sure initGame is called when the window loads
window.addEventListener('load', initGame);
