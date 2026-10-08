// Menu + briefing screen population. Phase 1: the scenario picker is gone,
// replaced by the level-select screen (src/ui/level-select.js). The briefing
// keeps the difficulty cards, but levels fix the difficulty, so game.js
// calls setFixedDifficulty() to preselect it and lock the picker.

export function populateDifficulties(difficulties) {
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

// Levels set the difficulty: preselect the card, disable the picker, and
// relabel the section so the player knows it is part of the mission.
export function setFixedDifficulty(difficultyId, difficulties) {
    const r0 = difficulties[difficultyId] ? difficulties[difficultyId].R0 : '';
    markDifficultySelected(difficultyId, r0);
    const grid = document.querySelector('.difficulty-grid');
    if (grid) grid.classList.add('fixed');
    const label = document.getElementById('difficulty-label');
    if (label) label.textContent = 'Mission difficulty:';
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
