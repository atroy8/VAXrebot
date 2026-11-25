// The solver (round 57): finds the best achievable play on a dealt level, so
// that stars can mean "you played it as well as it can be played" instead of
// "the dice were kind". Pure: no DOM, no dice, no clock.
//
// WHAT IT OPTIMISES, IN ORDER
//   1. win (the outbreak is contained, or the level's own goal is met)
//   2. fewest people ever sick (total cases)
//   3. fewest deaths
//   4. fewest days (a tie-break between lines it looked at, never a reason
//      to keep searching: days do not count for stars)
//
// HOW
// With predictable spread the game is a relative of the Firefighter problem
// on graphs: each night the infection crosses every live line from a
// spreader to someone who can catch it, and each day the player has a few
// tool uses. The search works on a compact copy of the level (bit masks, see
// compile) with its own night step that mirrors src/sim/engine.js rule for
// rule, and walks day by day:
//
//   - Only tonight's threats are branched on. For every person the
//     infection would reach tonight the player either lets it happen, shields
//     them for good (Vaccinate, or Quarantine on a healthy person), cuts
//     every line that would carry it, or (mask levels) delays it a night.
//     Before that, any sick person may be isolated (which closes all their
//     lines at once) or masked.
//   - Acting early is never forgotten: tool uses left over at the end of a
//     day are BANKED. A later day may spend them, and the move is then
//     written into the plan on the day the use was spare. A cut or a vaccine
//     on a line or person the infection has not reached yet changes nothing
//     in between, so "cut the bridge on day 1" and "cut it on day 3 with the
//     use you kept from day 1" are the same game. This is what lets the
//     search find "cut the bridge, not the nearest red line" without ever
//     branching on the hundreds of quiet lines. (Not on traveller levels,
//     where a cut changes which line a traveller drops; there the search is
//     reactive only.)
//   - Depth first, best looking plan first (fewest new cases tonight, then
//     the least onward risk), with branch and bound on (cases, deaths), so
//     the first line found is already good and the search is anytime. A node
//     budget (never a clock, so the same deal has the same par on every
//     device) ends it; result.exact says whether the whole tree was covered.
//   - Sick frail people are put into a ward with whatever Quarantine is left
//     each day, most urgent first. This is not branched on.
//
// PAR IS ACHIEVABLE BY CONSTRUCTION
// The search returns a concrete move list. replayMoves() plays that list
// through the public action functions of the real game (canUseTool,
// applyNodeTool, severLink, advanceDay) and par is what THAT run scored, so
// a par the player cannot reach cannot exist. If the compact model and the
// engine ever disagreed, result.mismatch says so (tests check it never does).
//
// HIDDEN CARRIERS: WHAT THE SOLVER MAY KNOW
// The solver must not use knowledge the player cannot have. Rule: on a level
// with hidden carriers its plan opens with Tests on the first case's
// contacts, in id order (an order that needs no knowledge), until every
// carrier is known for certain: found, or the only people left untested when
// the stated count says they must be. Only then may it isolate a carrier or
// cut around one. Tests have their own daily uses and the dealer only deals
// webs where a player testing in ANY order is certain by the end of day 1
// (contacts - 1 <= tests per day), so par needs reasoning and tests, never
// luck. See testPrefix below.
import { tools as TOOLS } from '../config/tools.js';
import { canUseTool, toolDailyLimit, toolAvailableDay, OVERWHELMED_DEATH_FRACTION, OVERWHELMED_DEATH_FLOOR } from './engine.js';
import { applyNodeTool, severLink, advanceDay, caseCapFor } from './actions.js';
import { frailDeathNight } from './fatality.js';
import { linkLocked, carrierCandidates, isCarrier } from './mechanics.js';
import { initGameState } from './state.js';

// Node states of the compact model.
const H = 0; // healthy and able to catch it
const I = 1; // sick, out and about
const V = 2; // vaccinated
const Q = 3; // isolated while healthy
const W = 4; // sick in a ward
const R = 5; // recovered
const D = 6; // dead
const C = 7; // carrier (no symptoms yet), out and about
const CQ = 8; // carrier in isolation
const HOME = 9; // sick, sent home by Stay Home Pay for a few days

export const DEFAULT_NODE_BUDGET = 3000;
const MAX_PLANS_PER_LEVEL = 120; // plans kept for one count of new cases tonight
const MAX_PLANS_PER_COMBO = 40; // of them, from one way to isolate and mask the sick
const MAX_PLANS_PER_DAY = 200; // past this, no worse count is opened
const MAX_ISOLATE_CHOICES = 7;
const MAX_MASK_SPREADERS = 4;
const MAX_DAYS = 60;

const endId = (ref) => (ref && typeof ref === 'object' ? ref.id : ref);
const bit = (i) => 1 << i;
const has = (mask, i) => (mask & (1 << i)) !== 0;
function popcount(x) {
    x -= (x >>> 1) & 0x55555555;
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}
const lowest = (x) => 31 - Math.clz32(x & -x);

// ---- A dealt level as plain data -------------------------------------------

// A fresh, playable copy of a deal: { state, network, scenario, difficulty }.
// `deal` is what src/sim/dealer.js returns (or anything of the same shape:
// population, nodes, links, scenario, difficulty and the marked ids).
export function instantiate(deal, tools = TOOLS) {
    const state = initGameState(tools, deal.population);
    state.stats.totalInfected += deal.initialCases || 0;
    state.envoyId = deal.envoyId ?? null;
    state.superSpreaderId = deal.superSpreaderId ?? null;
    if (deal.carrierCount) state.stats.hiddenInfections = deal.carrierCount;
    // Par rides on the stats, so stars can be read off any finished run.
    if (deal.par) state.stats.par = { cases: deal.par.cases, deaths: deal.par.deaths, days: deal.par.days };
    const nodes = deal.nodes.map((n) => ({ ...n, ...(n.route ? { route: [...n.route] } : {}) }));
    const links = deal.links.map((l) => ({ source: endId(l.source), target: endId(l.target) }));
    return { state, network: { nodes, links }, scenario: deal.scenario, difficulty: deal.difficulty };
}

// ---- Compile: the game as bit masks -----------------------------------------

// Reads a live run (fresh or mid level) into the compact problem and its
// starting state. Nothing is changed. Up to 32 people.
export function compile(run, tools = TOOLS, { cap = undefined, visibleOnly = false } = {}) {
    const { state, network, scenario, difficulty } = run;
    const n = state.stats.initialPopulation;
    if (n > 32) throw new Error('solver: webs of more than 32 people are not supported');
    const st = new Uint8Array(n).fill(D);
    const di = new Uint8Array(n);
    const home = new Uint8Array(n);
    const adj = new Int32Array(n);
    const chg = new Int32Array(n);
    let frail = 0;
    let masked = 0;
    let known = 0;
    let hub = -1;
    const travellers = [];
    for (const node of network.nodes) {
        const i = node.id;
        if (node.removed) continue;
        // visibleOnly: carriers nobody has found yet are the healthy people they look like.
        const carrier = isCarrier(node) && (!visibleOnly || node.state === 'exposed' || !!node.knownCase);
        if (node.state === 'healthy') st[i] = carrier ? C : H;
        else if (node.state === 'exposed') st[i] = carrier ? C : H;
        else if (node.state === 'infected') st[i] = I;
        else if (node.state === 'vaccinated') st[i] = V;
        else if (node.state === 'recovered') st[i] = R;
        else if (node.state === 'quarantined') {
            if (node.sickWhileQuarantined) {
                st[i] = node.homeUntilDay != null ? HOME : W;
                if (node.homeUntilDay != null) home[i] = node.homeUntilDay;
            } else st[i] = carrier ? CQ : Q;
        } else st[i] = D;
        di[i] = st[i] === C || st[i] === CQ ? node.incubating : node.daysInfected || 0;
        if (node.frail) frail |= bit(i);
        if (node.masked) masked |= bit(i);
        if (node.knownCase || node.state === 'exposed') known |= bit(i);
        if (node.hub) hub = i;
    }
    const order = new Map(); // traveller id -> contacts, oldest line first
    for (const node of network.nodes) if (node.traveller && !node.removed && Array.isArray(node.route)) order.set(node.id, []);
    for (const l of network.links) {
        const a = endId(l.source);
        const b = endId(l.target);
        if (a === b || st[a] === D || st[b] === D) continue;
        adj[a] |= bit(b);
        adj[b] |= bit(a);
        if (l.charged) {
            chg[a] |= bit(b);
            chg[b] |= bit(a);
        }
        if (order.has(a)) order.get(a).push(b);
        if (order.has(b)) order.get(b).push(a);
    }
    for (const node of network.nodes) {
        if (order.has(node.id)) travellers.push({ id: node.id, route: node.route, at: node.routeAt || 0, order: order.get(node.id) });
    }
    const limit = (id) => (tools[id] ? Math.max(0, toolDailyLimit(tools[id], difficulty, id)) : 0);
    const open = (id) => (tools[id] ? toolAvailableDay(tools[id], difficulty, id) : 1);
    const kit = difficulty.toolkit || null;
    const offered = (id) => (!kit || kit.includes(id) ? limit(id) : 0);
    const goal = scenario.goal || null;
    const P = {
        n,
        frail,
        hub,
        envoy: state.envoyId != null ? state.envoyId : -1,
        hasTravellers: travellers.length > 0,
        limits: { cut: offered('severLink'), vax: offered('vaccinate'), quar: offered('quarantine'), mask: offered('mask'), test: offered('test') },
        open: { cut: open('severLink'), vax: open('vaccinate'), quar: open('quarantine'), mask: open('mask'), test: open('test') },
        rec: difficulty.recoveryTime,
        deathNight: frailDeathNight(difficulty.recoveryTime),
        goalDays: goal && goal.type === 'holdLine' ? goal.days : 0,
        duration: scenario.duration,
        deathLine: Math.max(n * OVERWHELMED_DEATH_FRACTION, OVERWHELMED_DEATH_FLOOR),
        cap: cap !== undefined ? cap : caseCapFor(state, scenario),
        // Banking a spare use for later is only sound when a cut cannot
        // change anything else (see the header).
        banking: travellers.length === 0,
    };
    const u = state.dailyUsage || {};
    const s = {
        day: state.day,
        cases: state.stats.totalInfected,
        dead: state.stats.totalDead || 0,
        st,
        di,
        home,
        adj,
        chg,
        masked,
        known,
        used: { cut: u.severLink || 0, vax: u.vaccinate || 0, quar: u.quarantine || 0, mask: u.mask || 0 },
        bank: { cut: [], vax: [], quar: [] }, // [day, uses] pairs, oldest first
        trav: travellers,
        acted: state.stats.totalProtected + state.stats.linksSevered + (state.stats.masksGiven || 0) > 0,
        moves: null, // linked list { prev, move }
    };
    return { P, s };
}

function clone(s) {
    return {
        day: s.day,
        cases: s.cases,
        dead: s.dead,
        st: s.st.slice(),
        di: s.di.slice(),
        home: s.home,
        adj: s.adj.slice(),
        chg: s.chg.slice(),
        masked: s.masked,
        known: s.known,
        used: { cut: s.used.cut, vax: s.used.vax, quar: s.used.quar, mask: s.used.mask },
        bank: { cut: s.bank.cut.map((b) => [b[0], b[1]]), vax: s.bank.vax.map((b) => [b[0], b[1]]), quar: s.bank.quar.map((b) => [b[0], b[1]]) },
        trav: s.trav.length ? s.trav.map((t) => ({ id: t.id, route: t.route, at: t.at, order: [...t.order] })) : s.trav,
        acted: s.acted,
        moves: s.moves,
    };
}

function removeLink(s, a, b) {
    s.adj[a] &= ~bit(b);
    s.adj[b] &= ~bit(a);
    s.chg[a] &= ~bit(b);
    s.chg[b] &= ~bit(a);
    for (const t of s.trav) {
        if (t.id === a || t.id === b) {
            const other = t.id === a ? b : a;
            const k = t.order.indexOf(other);
            if (k >= 0) t.order.splice(k, 1);
        }
    }
}

const infectious = (code) => code === I || code === C;
const active = (code) => code === I || code === W || code === C || code === CQ || code === HOME;

function masksOf(s, P) {
    let susceptible = 0;
    let spreaders = 0;
    for (let i = 0; i < P.n; i++) {
        const c = s.st[i];
        if (c === H) susceptible |= bit(i);
        else if (c === I || c === C) spreaders |= bit(i);
    }
    return { susceptible, spreaders };
}

// Tonight's travel, as travelPlan in src/sim/mechanics.js reads it.
function travelPlanFast(s) {
    const plan = [];
    for (const t of s.trav) {
        const c = s.st[t.id];
        if (c === D || c === Q || c === W || c === CQ || c === HOME || !t.order.length) continue;
        const len = t.route.length;
        for (let k = 0; k < len; k++) {
            const at = (t.at + k) % len;
            const dest = t.route[at];
            const dc = s.st[dest];
            if (dc === D || dc === Q || dc === W || dc === CQ || dc === HOME || has(s.adj[t.id], dest)) continue;
            plan.push({ t, from: t.order[0], to: dest, at });
            break;
        }
    }
    return plan;
}

// One night, mirroring advanceDay in src/sim/actions.js. Mutates s.
// Returns null while the level goes on, or 'win' / 'loss'.
function night(P, s) {
    const n = P.n;
    const plan = s.trav.length ? travelPlanFast(s) : null;
    s.day++;
    s.used.cut = s.used.vax = s.used.quar = s.used.mask = 0;
    const st = s.st;
    const di = s.di;
    // Stay Home Pay: back out when the break is over (endStayHome).
    for (let i = 0; i < n; i++) if (st[i] === HOME && s.day >= s.home[i]) st[i] = I;
    const { susceptible, spreaders } = masksOf(s, P);
    let caught = 0;
    for (let rest = spreaders; rest !== 0; rest &= rest - 1) {
        const u = lowest(rest);
        const reach = s.adj[u] & susceptible;
        if (!reach) continue;
        if (!s.masked) {
            caught |= reach;
            continue;
        }
        const uMasked = has(s.masked, u);
        for (let r = reach; r !== 0; r &= r - 1) {
            const v = lowest(r);
            if (!uMasked && !has(s.masked, v)) caught |= bit(v);
            else if (has(s.chg[u], v)) caught |= bit(v);
        }
    }
    if (s.masked) {
        // Masked lines the infection reached tonight charge for tomorrow.
        for (let rest = spreaders; rest !== 0; rest &= rest - 1) {
            const u = lowest(rest);
            for (let r = s.adj[u] & susceptible; r !== 0; r &= r - 1) {
                const v = lowest(r);
                if (has(s.masked, u) || has(s.masked, v)) {
                    s.chg[u] |= bit(v);
                    s.chg[v] |= bit(u);
                }
            }
        }
    }
    for (let r = caught; r !== 0; r &= r - 1) {
        const v = lowest(r);
        st[v] = I;
        di[v] = 0;
        s.cases++;
    }
    for (let i = 0; i < n; i++) if (st[i] === I || st[i] === W || st[i] === HOME) di[i]++;
    // Carriers from before tonight move one night closer to symptoms.
    for (let rest = spreaders; rest !== 0; rest &= rest - 1) {
        const i = lowest(rest);
        if (st[i] !== C) continue;
        if (--di[i] > 0) continue;
        st[i] = I;
        di[i] = 1;
        if (!has(s.known, i)) {
            s.known |= bit(i);
            s.cases++;
        }
    }
    for (let i = 0; i < n; i++) {
        if (st[i] !== CQ) continue;
        if (--di[i] > 0) continue;
        st[i] = W;
        di[i] = 1;
        if (!has(s.known, i)) {
            s.known |= bit(i);
            s.cases++;
        }
    }
    // Deaths and recoveries (updateOutcomes).
    for (let i = 0; i < n; i++) {
        const c = st[i];
        if ((c !== I && c !== W && c !== HOME) || di[i] < 1) continue;
        if (c === I && has(P.frail, i) && di[i] >= P.deathNight) {
            st[i] = D;
            s.dead++;
            for (let r = s.adj[i]; r !== 0; r &= r - 1) removeLink(s, i, lowest(r));
        } else if (di[i] >= P.rec) st[i] = R;
    }
    // Travel (travelNight): the plan from before the night.
    if (plan) {
        for (const move of plan) {
            const t = move.t;
            if (st[t.id] === D || st[move.to] === D) continue;
            if (has(s.adj[t.id], move.from)) removeLink(s, t.id, move.from);
            if (!has(s.adj[t.id], move.to)) {
                s.adj[t.id] |= bit(move.to);
                s.adj[move.to] |= bit(t.id);
                t.order.push(move.to);
                for (const o of s.trav) if (o.id === move.to) o.order.push(t.id);
            }
            t.at = (move.at + 1) % t.route.length;
        }
    }
    return verdict(P, s);
}

// checkGameOver in src/sim/engine.js, on the compact state.
function verdict(P, s) {
    const st = s.st;
    if (P.envoy >= 0) {
        const e = st[P.envoy];
        if (e === I || e === W || e === D || e === HOME || ((e === C || e === CQ) && has(s.known, P.envoy))) return 'loss';
    }
    let live = 0;
    for (let i = 0; i < P.n; i++) if (active(st[i])) live++;
    if (live === 0) return s.acted ? 'win' : 'burnout';
    if (s.dead >= P.deathLine) return 'loss';
    if (s.cases >= P.cap) return 'loss';
    if (P.goalDays && s.day > P.goalDays && s.acted) return 'win';
    if (s.day >= P.duration && !spreadOver(P, s)) return 'loss';
    return null;
}

// spreadIsOver in src/sim/engine.js.
function spreadOver(P, s) {
    const st = s.st;
    let susceptible = 0;
    let soon = 0; // infectious now, or once a Stay Home break ends
    let roamRisk = false;
    for (let i = 0; i < P.n; i++) {
        const c = st[i];
        if (c === H) susceptible |= bit(i);
        else if (c === I || c === C || c === HOME) soon |= bit(i);
    }
    if (s.trav.length && susceptible && (soon & ~homeMask(s, P)) !== 0) {
        for (const t of s.trav) {
            const c = st[t.id];
            if ((c === H || c === I || c === C) && t.order.length) roamRisk = true;
        }
    }
    if (roamRisk) return false;
    for (let rest = soon; rest !== 0; rest &= rest - 1) if (s.adj[lowest(rest)] & susceptible) return false;
    return true;
}
function homeMask(s, P) {
    let m = 0;
    for (let i = 0; i < P.n; i++) if (s.st[i] === HOME) m |= bit(i);
    return m;
}

// ---- Moves -------------------------------------------------------------------

function note(s, move) {
    s.moves = { prev: s.moves, move };
    s.acted = true;
}

// Take `uses` of a tool: today's first, then banked days (oldest first).
// Returns the days the uses come from, or null when there are not enough.
function capacity(P, s, tool) {
    const today = s.day >= P.open[tool] ? Math.max(0, P.limits[tool] - s.used[tool]) : 0;
    let banked = 0;
    const bank = s.bank[tool];
    if (bank) for (const b of bank) banked += b[1];
    return { today, banked, total: today + banked };
}
function take(P, s, tool) {
    if (s.day >= P.open[tool] && s.used[tool] < P.limits[tool]) {
        s.used[tool]++;
        return s.day;
    }
    const bank = s.bank[tool];
    if (bank) {
        for (const b of bank) {
            if (b[1] > 0) {
                b[1]--;
                return b[0];
            }
        }
    }
    return -1;
}

function doCut(P, s, a, b) {
    const day = take(P, s, 'cut');
    if (day < 0) return false;
    removeLink(s, a, b);
    note(s, { day, toolId: 'severLink', a: Math.min(a, b), b: Math.max(a, b) });
    return true;
}
function doShield(P, s, v) {
    // Vaccinate when a dose is to hand, otherwise isolate the healthy person
    // (never the place that must stay open).
    let day = take(P, s, 'vax');
    let toolId = 'vaccinate';
    if (day < 0) {
        if (v === P.hub) return false;
        day = take(P, s, 'quar');
        toolId = 'quarantine';
        if (day < 0) return false;
    }
    s.st[v] = toolId === 'vaccinate' ? V : Q;
    note(s, { day, toolId, node: v });
    return true;
}
function doIsolate(P, s, u) {
    // Today's uses only: a person must be sick on the day they are isolated.
    if (s.day < P.open.quar || s.used.quar >= P.limits.quar) return false;
    s.used.quar++;
    const c = s.st[u];
    s.st[u] = c === C ? CQ : W;
    note(s, { day: s.day, toolId: 'quarantine', node: u });
    return true;
}
function doMask(P, s, x) {
    if (s.day < P.open.mask || s.used.mask >= P.limits.mask || has(s.masked, x)) return false;
    s.used.mask++;
    s.masked |= bit(x);
    note(s, { day: s.day, toolId: 'mask', node: x });
    return true;
}

// Ward care for sick frail people with what is left of today's Quarantine,
// most urgent first. Then bank what is left of the day (banking levels).
function endOfDay(P, s) {
    if (s.day >= P.open.quar && P.frail) {
        while (s.used.quar < P.limits.quar) {
            let pick = -1;
            for (let i = 0; i < P.n; i++) {
                if (s.st[i] === I && has(P.frail, i) && (pick < 0 || s.di[i] > s.di[pick])) pick = i;
            }
            if (pick < 0) break;
            doIsolate(P, s, pick);
        }
    }
    if (!P.banking) return;
    for (const tool of ['cut', 'vax', 'quar']) {
        if (s.day < P.open[tool]) continue;
        const spare = P.limits[tool] - s.used[tool];
        if (spare > 0) s.bank[tool].push([s.day, spare]);
    }
}

// ---- Tonight's threats ---------------------------------------------------------

// For the state as it stands: who catches it tonight and through which
// spreaders. Returns { front: mask, from: Int32Array (spreaders whose line to
// v crosses tonight), pending: bool (some masked line is charging) }.
function threats(P, s) {
    const { susceptible, spreaders } = masksOf(s, P);
    const from = new Int32Array(P.n);
    let front = 0;
    let pending = false;
    for (let rest = spreaders; rest !== 0; rest &= rest - 1) {
        const u = lowest(rest);
        for (let r = s.adj[u] & susceptible; r !== 0; r &= r - 1) {
            const v = lowest(r);
            if (s.masked && (has(s.masked, u) || has(s.masked, v)) && !has(s.chg[u], v)) {
                pending = true;
                continue;
            }
            from[v] |= bit(u);
            front |= bit(v);
        }
    }
    return { front, from, pending, susceptible, spreaders };
}

// ---- The search ------------------------------------------------------------------

function better(a, b) {
    // a, b: { cases, deaths, days }. True when a beats b.
    if (!b) return true;
    if (a.cases !== b.cases) return a.cases < b.cases;
    if (a.deaths !== b.deaths) return a.deaths < b.deaths;
    return a.days < b.days;
}

function movesOf(s) {
    const out = [];
    for (let m = s.moves; m; m = m.prev) out.push(m.move);
    out.reverse();
    // By day, and within a day in the order the search made them (a banked
    // move lands at the end of the day its use was spare).
    return out
        .map((m, k) => ({ m, k }))
        .sort((x, y) => x.m.day - y.m.day || x.k - y.k)
        .map((x) => x.m);
}

// Today's choices about tonight's threats, in two steps so the search only
// builds the plans it can still use:
//   prepareDay  every way to isolate and mask the sick, and for each the
//               people still in danger and the fewest of them that must be
//               let go
//   plansAt     the plans that let exactly `burn` people fall sick tonight,
//               least onward risk first
// The search asks for burn = fewest, fewest + 1, ... and stops as soon as a
// level cannot beat the best line found. A day with a very wide front has
// too many plans to try them all: each level keeps at most
// MAX_PLANS_PER_LEVEL, and past MAX_PLANS_PER_DAY no further level is opened
// ("sacrifice one to bank a use" is always looked at). counter.capped
// records that the search was not exhaustive.
function prepareDay(P, s, th, counter) {
    const spreaderList = [];
    for (let rest = th.spreaders; rest !== 0; rest &= rest - 1) {
        const u = lowest(rest);
        let reach = 0;
        let plain = 0;
        for (let r = th.front; r !== 0; r &= r - 1) {
            const v = lowest(r);
            if (has(th.from[v], u)) {
                reach++;
                if (!has(s.masked, u) && !has(s.masked, v)) plain++;
            }
        }
        // A masked line that is still charging is tomorrow's threat.
        const pend = popcount(s.adj[u] & th.susceptible) - reach;
        if (reach + pend > 0) spreaderList.push({ u, reach, plain, pend });
    }
    spreaderList.sort((x, y) => y.reach - x.reach || y.pend - x.pend || x.u - y.u);
    const quarToday = s.day >= P.open.quar ? Math.max(0, P.limits.quar - s.used.quar) : 0;
    const maskToday = s.day >= P.open.mask ? Math.max(0, P.limits.mask - s.used.mask) : 0;
    const isoPool = spreaderList.slice(0, MAX_ISOLATE_CHOICES);
    if (spreaderList.length > isoPool.length && quarToday > 0) counter.capped = true;
    const maskPool = maskToday > 0 ? spreaderList.filter((x) => x.plain > 0 && !has(s.masked, x.u)).slice(0, MAX_MASK_SPREADERS) : [];
    const cuts = capacity(P, s, 'cut').total;
    const vax = capacity(P, s, 'vax').total;
    const quarBank = s.bank.quar.reduce((a, b) => a + b[1], 0);
    let later = th.spreaders; // anyone who can spread now or after a break at home
    for (let i = 0; i < P.n; i++) if (s.st[i] === HOME) later |= bit(i);

    const combos = [];
    let fewest = Infinity;
    for (const iso of subsets(isoPool.map((x) => x.u), quarToday)) {
        let isoMask = 0;
        for (const u of iso) isoMask |= bit(u);
        const maskSets = subsets(maskPool.map((x) => x.u).filter((u) => !has(isoMask, u)), maskToday);
        for (const ms of maskSets) {
            let msMask = 0;
            for (const u of ms) msMask |= bit(u);
            const todo = [];
            for (let r = th.front; r !== 0; r &= r - 1) {
                const v = lowest(r);
                let cross = 0; // spreaders whose line still crosses tonight
                let chargedIn = false;
                for (let f = th.from[v] & ~isoMask; f !== 0; f &= f - 1) {
                    const u = lowest(f);
                    const wasMasked = has(s.masked, u) || has(s.masked, v);
                    if (!wasMasked && has(msMask, u)) continue; // newly masked: charges tonight
                    cross |= bit(u);
                    if (wasMasked) chargedIn = true;
                }
                if (!cross) continue;
                const locked = P.hub >= 0 && (v === P.hub || has(cross, P.hub));
                const cost = popcount(cross);
                const canMask = !chargedIn && !has(s.masked, v);
                const onward = popcount(s.adj[v] & th.susceptible);
                // People with nobody further to infect and no other threat
                // are interchangeable when they cost the same: `twin` names
                // the group, so the search does not try every order of them.
                const lone = onward === 0 && (s.adj[v] & later & ~isoMask) === cross && !s.trav.length;
                const twin = lone ? `${cost}${locked ? 'L' : ''}${canMask ? 'M' : ''}${has(P.frail, v) ? 'F' : ''}${v === P.envoy ? 'E' : ''}` : '';
                todo.push({ v, cross, cost, locked, canMask, onward, twin });
            }
            // People with the most onward contacts are decided first.
            todo.sort((x, y) => y.onward - x.onward || (x.twin < y.twin ? -1 : x.twin > y.twin ? 1 : 0) || x.cost - y.cost || x.v - y.v);
            const shields = vax + Math.max(0, quarToday - iso.length) + quarBank;
            const masksLeft = maskToday - ms.length;
            // Fewest people this combination can leave to fall sick tonight:
            // shields and masks on the costliest, cuts on the cheapest.
            const costs = todo.map((t) => (t.locked ? Infinity : t.cost)).sort((x, y) => x - y);
            const shielded = Math.min(costs.length, shields + Math.min(masksLeft, todo.filter((t) => t.canMask).length));
            let cutSaved = 0;
            let left = cuts;
            for (let k = 0; k < costs.length - shielded && costs[k] <= left; k++, cutSaved++) left -= costs[k];
            const minBurn = Math.max(0, todo.length - shielded - cutSaved);
            fewest = Math.min(fewest, minBurn);
            combos.push({ iso, ms, todo, shields, masksLeft, minBurn });
        }
    }
    let widest = 0;
    for (const c of combos) widest = Math.max(widest, c.todo.length);
    return { combos, fewest, widest, cuts, made: 0 };
}

function plansAt(day, burn, counter) {
    const plans = [];
    let truncated = false;
    for (const combo of day.combos) {
        if (combo.minBurn > burn || combo.todo.length < burn) continue;
        const { todo } = combo;
        const choice = new Array(todo.length);
        let mine = 0;
        const walk = (k, cutsLeft, shieldsLeft, mLeft, burned, risk) => {
            if (mine >= MAX_PLANS_PER_COMBO) return;
            const rest = todo.length - k;
            if (burned + rest < burn) return;
            if (k === todo.length) {
                mine++;
                plans.push({ iso: combo.iso, masks: combo.ms, todo, choice: choice.slice(), burned, risk, spent: day.cuts - cutsLeft + (combo.shields - shieldsLeft) });
                return;
            }
            const t = todo[k];
            // Among twins, the saved come first, and cuts before shields.
            const prev = k > 0 && t.twin && todo[k - 1].twin === t.twin ? choice[k - 1] : null;
            if (prev !== 'burn') {
                if (!t.locked && t.cost <= cutsLeft && prev !== 'shield' && prev !== 'mask') {
                    choice[k] = 'cut';
                    walk(k + 1, cutsLeft - t.cost, shieldsLeft, mLeft, burned, risk);
                }
                if (shieldsLeft > 0 && prev !== 'mask') {
                    choice[k] = 'shield';
                    walk(k + 1, cutsLeft, shieldsLeft - 1, mLeft, burned, risk);
                }
                if (mLeft > 0 && t.canMask) {
                    choice[k] = 'mask';
                    walk(k + 1, cutsLeft, shieldsLeft, mLeft - 1, burned, risk + 1);
                }
            }
            if (burned < burn) {
                choice[k] = 'burn';
                walk(k + 1, cutsLeft, shieldsLeft, mLeft, burned + 1, risk + t.onward);
            }
        };
        walk(0, day.cuts, combo.shields, combo.masksLeft, 0, 0);
        if (mine >= MAX_PLANS_PER_COMBO) truncated = true;
    }
    plans.sort((a, b) => a.risk - b.risk || a.spent - b.spent || a.iso.length - b.iso.length);
    if (plans.length > MAX_PLANS_PER_LEVEL) {
        plans.length = MAX_PLANS_PER_LEVEL;
        truncated = true;
    }
    if (truncated) counter.capped = true;
    day.made += plans.length;
    return plans;
}

// All subsets of `items` with at most `max` members, the empty one first.
function subsets(items, max) {
    const out = [[]];
    if (max <= 0) return out;
    const walk = (start, cur) => {
        for (let i = start; i < items.length; i++) {
            cur.push(items[i]);
            out.push(cur.slice());
            if (cur.length < max) walk(i + 1, cur);
            cur.pop();
        }
    };
    walk(0, []);
    return out;
}

function applyPlan(P, s, plan) {
    for (const u of plan.iso) if (!doIsolate(P, s, u)) return false;
    for (const u of plan.masks) if (!doMask(P, s, u)) return false;
    for (let k = 0; k < plan.todo.length; k++) {
        const t = plan.todo[k];
        const c = plan.choice[k];
        if (c === 'cut') {
            for (let f = t.cross; f !== 0; f &= f - 1) if (!doCut(P, s, lowest(f), t.v)) return false;
        } else if (c === 'shield') {
            if (!doShield(P, s, t.v)) return false;
        } else if (c === 'mask') {
            if (!doMask(P, s, t.v)) return false;
        }
    }
    return true;
}

// Search from a compiled state. Returns
//   { found, cases, deaths, days, moves, exact, nodes }
// moves: [{ day, toolId, node } | { day, toolId: 'severLink', a, b }] by day.
export function search(P, start, { nodeBudget = DEFAULT_NODE_BUDGET } = {}) {
    let best = null;
    let bestMoves = null;
    const counter = { nodes: 0, capped: false, out: false };

    const leaf = (s, result) => {
        if (result !== 'win') return;
        const score = { cases: s.cases, deaths: s.dead, days: s.day };
        if (better(score, best)) {
            best = score;
            bestMoves = s.moves;
        }
    };
    // Cannot beat the best line on (cases, deaths) any more.
    const hopeless = (cases, dead) => best && (cases > best.cases || (cases === best.cases && dead >= best.deaths));

    // Carriers nobody has counted yet: each becomes a case when they fall sick.
    const uncounted = (s) => {
        let k = 0;
        for (let i = 0; i < P.n; i++) if ((s.st[i] === C || s.st[i] === CQ) && !has(s.known, i)) k++;
        return k;
    };

    const dfs = (s) => {
        // Quiet days: nothing to decide, so care for the frail and sleep.
        for (;;) {
            if (counter.out) return;
            if (hopeless(s.cases + uncounted(s), s.dead)) return;
            const th = threats(P, s);
            if (th.front || s.day > MAX_DAYS) {
                if (s.day > MAX_DAYS) return;
                branch(s, th);
                return;
            }
            // A line that is charging can still be dealt with tomorrow.
            s = clone(s);
            endOfDay(P, s);
            const result = night(P, s);
            if (result) return leaf(s, result);
        }
    };
    const branch = (s, th) => {
        const day = prepareDay(P, s, th, counter);
        const hiddenLeft = uncounted(s);
        for (let burn = day.fewest; burn <= day.widest; burn++) {
            if (counter.out) return;
            // Levels come in order of cases tonight: once one cannot beat
            // the best line, no later one can.
            if (hopeless(s.cases + burn + hiddenLeft, s.dead)) return;
            if (burn > day.fewest + 1 && day.made > MAX_PLANS_PER_DAY) {
                counter.capped = true;
                return;
            }
            for (const plan of plansAt(day, burn, counter)) {
                if (counter.out) return;
                if (hopeless(s.cases + burn + hiddenLeft, s.dead)) return;
                if (++counter.nodes > nodeBudget) {
                    counter.out = true;
                    return;
                }
                const next = clone(s);
                if (!applyPlan(P, next, plan)) continue;
                endOfDay(P, next);
                const result = night(P, next);
                if (result) leaf(next, result);
                else dfs(next);
            }
        }
    };
    dfs(clone(start));
    if (!best) return { found: false, exact: !counter.out && !counter.capped, nodes: counter.nodes, moves: [] };
    return { found: true, ...best, moves: movesOf({ moves: bestMoves }), exact: !counter.out && !counter.capped, nodes: counter.nodes };
}

// ---- Hidden carriers: the opening tests ---------------------------------------------

// The Tests the solver's plan opens with on a run that still has hidden
// carriers, in id order, stopping as soon as every carrier is known for
// certain. Reads only what the player could work out for themselves while
// testing in this order (see the header). Returns { tests: [ids], certain }
// where certain is false when today's tests cannot settle it.
export function testPrefix(run, tools = TOOLS) {
    const { state, network, difficulty } = run;
    const hiddenLeft = network.nodes.filter((n) => !n.removed && isCarrier(n) && n.state !== 'exposed' && n.state !== 'quarantined').length;
    if (!hiddenLeft) return { tests: [], certain: true };
    const candidates = carrierCandidates(network.nodes, network.links).filter((n) => !n.testedClear);
    const tool = tools.test;
    const usesLeft = tool && state.day >= toolAvailableDay(tool, difficulty, 'test') ? Math.max(0, toolDailyLimit(tool, difficulty, 'test') - (state.dailyUsage.test || 0)) : 0;
    const tests = [];
    let unknown = hiddenLeft;
    let pool = candidates.length;
    for (const n of candidates) {
        if (unknown === 0 || pool === unknown) break; // everyone left is clear, or everyone left carries it
        if (tests.length >= usesLeft) return { tests: tests, certain: false };
        tests.push(n.id);
        pool--;
        if (isCarrier(n)) unknown--;
    }
    return { tests, certain: true };
}

// ---- Solve a run ---------------------------------------------------------------------

// Best play from a live run (fresh or mid level). Nothing is changed.
// Returns { found, cases, deaths, days, moves, exact, nodes }.
export function solveRun(run, { nodeBudget = DEFAULT_NODE_BUDGET, tools = TOOLS, cap = undefined } = {}) {
    const prefix = testPrefix(run, tools);
    // Until the carriers are known for certain the solver plans on what can
    // be seen: hidden carriers are treated as the healthy people they look like.
    const { P, s } = compile(run, tools, { cap, visibleOnly: !prefix.certain });
    const tests = prefix.tests.map((id) => ({ day: run.state.day, toolId: 'test', node: id }));
    const out = search(P, s, { nodeBudget });
    return { ...out, moves: [...tests, ...out.moves] };
}

// Play a move list through the real game functions on a fresh copy of the
// deal. Returns { valid, outcome, cases, deaths, days, stats, history }.
// history is one line per day: a compact picture of every person and line.
export function replayMoves(deal, moves, { tools = TOOLS, policy = null, maxDays = MAX_DAYS, keepHistory = false } = {}) {
    const run = instantiate(deal, tools);
    const { state, network, scenario, difficulty } = run;
    const byDay = new Map();
    for (const m of moves || []) {
        if (!byDay.has(m.day)) byDay.set(m.day, []);
        byDay.get(m.day).push(m);
    }
    const history = [];
    let valid = true;
    let result = null;
    for (let guard = 0; guard < maxDays && !result; guard++) {
        for (const m of byDay.get(state.day) || []) {
            if (!applyMove(run, m, tools)) valid = false;
        }
        if (policy) policy(run);
        if (keepHistory) history.push(snapshotLine(state, network));
        result = advanceDay(state, network, { scenario, difficulty }).result;
    }
    if (keepHistory) history.push(snapshotLine(state, network));
    return { valid, outcome: result, cases: state.stats.totalInfected, deaths: state.stats.totalDead, days: state.day, stats: state.stats, history, run };
}

// Apply one solver move to a live run through the public action functions.
// Returns false (and changes nothing) when the game would not allow it.
export function applyMove(run, move, tools = TOOLS) {
    const { state, network, difficulty } = run;
    const found = findMove(network, move);
    if (!found) return false;
    if (difficulty.toolkit && !difficulty.toolkit.includes(move.toolId)) return false;
    if (move.toolId === 'severLink') {
        if (linkLocked(found.link, network)) return false;
        if (!canUseTool(state, tools, 'severLink', difficulty).allowed) return false;
        severLink(state, network, found.link);
        return true;
    }
    if (!canUseTool(state, tools, move.toolId, difficulty, found.node).allowed) return false;
    applyNodeTool(state, tools, move.toolId, found.node);
    return true;
}

// The live node or link a solver move points at, or null when it is gone.
export function findMove(network, move) {
    if (move.toolId === 'severLink') {
        const link = network.links.find((l) => {
            const a = endId(l.source);
            const b = endId(l.target);
            return (a === move.a && b === move.b) || (a === move.b && b === move.a);
        });
        return link ? { link } : null;
    }
    const node = network.nodes.find((n) => n.id === move.node && !n.removed);
    return node ? { node } : null;
}

// One line that pins down the whole state, for determinism tests.
export function snapshotLine(state, network) {
    const people = network.nodes
        .map((n) => `${n.id}:${n.state}${n.daysInfected || 0}${n.incubating != null ? `i${n.incubating}` : ''}${n.sickWhileQuarantined ? 'w' : ''}${n.masked ? 'm' : ''}${n.routeAt != null ? `r${n.routeAt}` : ''}`)
        .join(',');
    const lines = network.links.map((l) => `${endId(l.source)}-${endId(l.target)}${l.charged ? '!' : ''}`).join(',');
    const s = state.stats;
    return `d${state.day} c${s.totalInfected} x${s.totalDead} r${s.totalRecovered} | ${people} | ${lines}`;
}

// Solve a deal from its first morning and confirm the line with the real
// game. Returns { found, cases, deaths, days, moves, exact, nodes, mismatch }
// where cases, deaths and days are what the replay through the engine
// scored: par is achievable by construction.
export function solveDeal(deal, { nodeBudget = DEFAULT_NODE_BUDGET, tools = TOOLS } = {}) {
    const run = instantiate(deal, tools);
    // Par is searched without a case cap: the dealer sets the cap from par.
    const model = solveRun(run, { nodeBudget, tools, cap: Infinity });
    if (!model.found) return { found: false, exact: model.exact, nodes: model.nodes, moves: [], mismatch: false };
    const played = replayMoves({ ...deal, scenario: { ...deal.scenario, caseCap: Infinity } }, model.moves, { tools });
    const won = played.valid && played.outcome === 'contained';
    return {
        found: won,
        cases: played.cases,
        deaths: played.deaths,
        days: played.days,
        moves: model.moves,
        exact: model.exact,
        nodes: model.nodes,
        mismatch: !played.valid || played.outcome !== 'contained' || played.cases !== model.cases || played.deaths !== model.deaths || played.days !== model.days,
    };
}
