// Per-run mutable game state factory. Called fresh on every startGame().

export function initGameState(tools, population = 100) {
    return {
        day: 1,
        paused: false,
        gameOver: false,
        outcome: null, // 'contained' | 'overwhelmed' | 'timeout' | 'burnout' once the game ends
        stats: {
            totalInfected: 0,
            totalProtected: 0,
            linksSevered: 0,
            initialPopulation: population,
            totalDead: 0,
            totalRecovered: 0,
        },
        dailyUsage: Object.keys(tools).reduce((acc, tool) => ({ ...acc, [tool]: 0 }), {}),
        usedOnPeople: new Set(),
    };
}
