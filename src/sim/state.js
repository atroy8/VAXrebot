// Per-run mutable game state factory. Called fresh on every startGame().

export function initGameState(tools) {
    return {
        day: 1,
        paused: false,
        gameOver: false,
        outcome: null, // 'contained' | 'overwhelmed' | 'timeout' once the game ends
        stats: {
            totalInfected: 0,
            totalProtected: 0,
            linksSevered: 0,
            initialPopulation: 100,
            totalDead: 0,
            totalRecovered: 0,
        },
        dailyUsage: Object.keys(tools).reduce((acc, tool) => ({ ...acc, [tool]: 0 }), {}),
        usedOnPeople: new Set(),
    };
}
