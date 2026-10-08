// DOM rendering for the game screen chrome: header stats, tools panel,
// action log, toast notifications, and the game-over stats screen.
// No game logic here; callers pass plain data.

export function renderHeader({ scenarioName, difficultyName, difficultyId, day, infected, protected: protectedCount, population, paused = false }) {
    document.getElementById('game-scenario-name').textContent = scenarioName;
    const badge = `<span class="difficulty-badge ${difficultyId}">${difficultyName}</span>`;
    document.getElementById('current-difficulty-badge').innerHTML = badge;

    // Clear paused indicator: the day stat reads "N (Paused)" while paused.
    document.getElementById('current-day').textContent = paused ? `${day} (Paused)` : day;
    document.getElementById('infected-count').textContent = infected;
    document.getElementById('protected-count').textContent = protectedCount;
    document.getElementById('population-count').textContent = population;
}

export function renderTools(tools, difficulty, day, dailyUsage) {
    const toolsList = document.getElementById('tools-list');
    toolsList.innerHTML = Object.entries(tools)
        .map(([id, tool]) => {
            const limit = Math.floor(tool.baseDailyLimit * difficulty.toolLimitMultiplier);
            const available = day >= tool.availableDay;
            const disabled = !available || dailyUsage[id] >= limit;
            return `
                <div class="tool-item ${disabled ? 'disabled' : ''}" data-tool="${id}">
                    <div class="tool-header">
                        <span class="tool-name">${tool.name}</span>
                        <span class="tool-usage">${dailyUsage[id]}/${limit}</span>
                    </div>
                    <p class="tool-description">${tool.description}</p>
                    ${!available ? `<div class="tool-availability">Available Day ${tool.availableDay}</div>` : ''}
                </div>
            `;
        })
        .join('');
}

// Note: the old write-only gameState.log array is gone; the DOM log below is
// the source of truth (capped at 50 entries, reverse-chronological).
export function addLogEntry(day, message, important = false) {
    const logContainer = document.getElementById('log-entries');
    const entry = document.createElement('div');
    entry.className = `log-entry ${important ? 'important' : ''}`;
    entry.innerHTML = `<span class="log-time">Day ${day}</span> <span class="log-message">${message}</span>`;
    logContainer.prepend(entry);
    if (logContainer.children.length > 50) {
        logContainer.removeChild(logContainer.lastChild);
    }
}

export function showNotification(message, type = 'info') {
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

export function renderGameOver({ outcome, stats, difficultyId }) {
    const attackRate = stats.initialPopulation > 0 ? (stats.totalInfected / stats.initialPopulation) * 100 : 0;
    const caseFatalityRate = stats.totalInfected > 0 ? (stats.totalDead / stats.totalInfected) * 100 : 0;

    // Distinct copy per outcome. 'overwhelmed' is the loss: deaths reached the
    // 20% threshold and overwhelmed the response. Keep copy plain, no em dashes.
    const title =
        outcome === 'contained'
            ? 'Outbreak Contained!'
            : outcome === 'overwhelmed'
              ? 'Outbreak Overwhelmed'
              : 'Simulation Over';
    const message =
        outcome === 'contained'
            ? 'Excellent work! Your strategic interventions stopped the spread.'
            : outcome === 'overwhelmed'
              ? 'Deaths have overwhelmed the response. Too many lives were lost before the outbreak could be contained. Review the results and try a new strategy.'
              : 'The simulation period has ended. Analyze the results and try a new strategy.';

    document.getElementById('game-over-title').textContent = title;
    document.getElementById('final-total-infected').textContent = stats.totalInfected;
    document.getElementById('final-total-dead').textContent = stats.totalDead;
    document.getElementById('final-total-recovered').textContent = stats.totalRecovered;
    document.getElementById('final-attack-rate').textContent = `${attackRate.toFixed(1)}%`;
    document.getElementById('final-case-fatality').textContent = `${caseFatalityRate.toFixed(1)}%`;
    document.getElementById('people-protected').textContent = stats.totalProtected;

    document.getElementById('game-over-message').textContent = message;

    // Outcome hook for styling: win, loss, or timeout on the screen element.
    const screen = document.getElementById('game-over-screen');
    screen.classList.remove('outcome-win', 'outcome-loss', 'outcome-timeout');
    screen.classList.add(outcome === 'contained' ? 'outcome-win' : outcome === 'overwhelmed' ? 'outcome-loss' : 'outcome-timeout');

    const badge = document.createElement('span');
    badge.className = `difficulty-badge ${difficultyId}`;
    badge.textContent = difficultyId;
    document.getElementById('final-difficulty-badge').innerHTML = 'Completed on ';
    document.getElementById('final-difficulty-badge').appendChild(badge);
}
