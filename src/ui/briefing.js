// Menu + briefing screen population. Renders the scenario and difficulty cards
// and fills the briefing panel; game.js owns selection state.

export function populateMenus(scenarios, difficulties) {
    const scenarioGrid = document.querySelector('.scenario-grid');
    scenarioGrid.innerHTML = Object.values(scenarios)
        .map(
            (s) => `
                <div class="scenario-card" data-scenario="${s.id}">
                    <div class="scenario-icon">${s.icon}</div>
                    <h3>${s.name}</h3>
                    <p>${s.description}</p>
                    <div class="scenario-stats">
                        <span>${s.duration} days</span> • <span>${s.networkType} network</span>
                    </div>
                </div>
            `
        )
        .join('');

    const difficultyGrid = document.querySelector('.difficulty-grid');
    difficultyGrid.innerHTML = Object.entries(difficulties)
        .map(
            ([key, d]) => `
                 <div class="difficulty-card" data-difficulty="${key}">
                    <div class="difficulty-icon">${d.icon}</div>
                    <h4>${d.name}</h4>
                    <p>${d.description}</p>
                    <div class="r0-value">R₀: ${d.R0}</div>
                </div>
            `
        )
        .join('');
}

export function fillBriefing(scenario) {
    document.getElementById('briefing-title').textContent = scenario.name;
    document.getElementById('briefing-description-text').textContent = scenario.description;
    document.getElementById('briefing-disease').textContent = scenario.diseaseName;
    document.getElementById('briefing-agent').textContent = scenario.agent;
    document.getElementById('briefing-vector').textContent = scenario.vector;
}

export function markDifficultySelected(difficultyId, r0) {
    document.querySelectorAll('.difficulty-card').forEach((c) => c.classList.remove('selected'));
    document.querySelector(`.difficulty-card[data-difficulty="${difficultyId}"]`).classList.add('selected');
    document.getElementById('briefing-r0').textContent = r0;
}
