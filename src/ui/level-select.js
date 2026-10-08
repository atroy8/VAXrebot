// Level-select screen: renders regions and level cards with lock/star state.
// Phase 1 is a functional list grouped by region; the world map UI arrives
// in phase 2. game.js owns selection state and click handling.

import {
    isLevelUnlocked,
    lockReason,
    levelRecord,
    totalStars,
    regionProgress,
} from '../progress.js';
import { scenarios } from '../config/scenarios.js';
import { difficulties } from '../config/difficulties.js';

function starRow(stars) {
    return '★'.repeat(stars) + '☆'.repeat(3 - stars);
}

export function renderLevelSelect({ save, levels, regions }) {
    // HUD: totals across the whole campaign.
    const hudStars = document.getElementById('hud-stars');
    const hudFunding = document.getElementById('hud-funding');
    const hudLives = document.getElementById('hud-lives');
    if (hudStars) hudStars.textContent = `⭐ ${totalStars(save)}`;
    if (hudFunding) hudFunding.textContent = `💰 ${save.funding}`;
    if (hudLives) hudLives.textContent = `❤️ ${save.livesSaved.toLocaleString()}`;

    const grid = document.getElementById('level-grid');
    if (!grid) return;

    grid.innerHTML = regions
        .map((region) => {
            const progress = regionProgress(save, levels, region.id);
            const regionLevels = levels.filter((l) => l.regionId === region.id);
            const gate =
                region.starRequirement > 0
                    ? `<span class="region-gate">Requires ${region.starRequirement} ⭐ (you have ${totalStars(save)})</span>`
                    : '';
            const cards = regionLevels
                .map((level) => {
                    const unlocked = isLevelUnlocked(save, levels, regions, level.id);
                    const rec = levelRecord(save, level.id);
                    const scenario = scenarios[level.scenarioId];
                    const difficulty = difficulties[level.difficultyId];
                    if (!unlocked) {
                        const reason = lockReason(save, levels, regions, level.id);
                        return `
                            <div class="level-card locked" data-level="${level.id}">
                                <div class="level-icon">🔒</div>
                                <h3>${level.name}</h3>
                                <p class="level-lock-reason">${reason}</p>
                            </div>`;
                    }
                    return `
                        <div class="level-card" data-level="${level.id}">
                            <div class="level-icon">${scenario.icon}</div>
                            <h3>${level.name}</h3>
                            <p>${level.blurb}</p>
                            <div class="level-meta">
                                <span class="level-stars">${starRow(rec.stars)}</span>
                                <span class="level-difficulty">${difficulty.icon} ${difficulty.name}</span>
                            </div>
                        </div>`;
                })
                .join('');
            return `
                <div class="level-region">
                    <div class="region-header">
                        <h2>${region.name}</h2>
                        <p>${region.tagline}</p>
                        <div class="region-progress">${progress.completed}/${progress.total} missions • ${progress.stars}/${progress.maxStars} ⭐ ${gate}</div>
                    </div>
                    <div class="region-levels">${cards}</div>
                </div>`;
        })
        .join('');
}
