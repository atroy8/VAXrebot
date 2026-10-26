// ALL D3 touchpoints live in this file and nowhere else.
// NetworkView owns the force simulation, zoom, drag, data joins, transitions,
// and virus-particle animations. Node rendering reads node.state for its CSS class.
// Node glyphs come from the local sprite set in src/sprites.js (fully offline).
import * as d3 from 'd3';
import { spriteFor } from '../sprites.js';

// Sprite size in SVG units (nodes have radius 7; sprites sit slightly larger).
const SPRITE_SIZE = 16;
const SPRITE_HOVER_SIZE = 24;
// Transparent tap target radius. The visible node is only 7 SVG units
// (about 14px on a phone), too small to tap reliably, so each node gets
// a larger invisible hit circle. It stays below typical node spacing
// (link distance 50) so dense clusters still tap the intended node.
const NODE_HIT_RADIUS = 16;

export class NetworkView {
    constructor() {
        this.simulation = null;
        this.visGroup = null;
        this.linkGroup = null;
        this.nodeGroup = null;
        this.particleGroup = null;
        this.onNodeClick = null;
        this.onLinkClick = null;
        this.resizeObserver = null;
        this.paused = false;
    }

    setup({ onNodeClick, onLinkClick }) {
        this.onNodeClick = onNodeClick;
        this.onLinkClick = onLinkClick;

        const container = document.querySelector('.network-container');
        const svg = d3.select('#network-svg');
        svg.selectAll('*').remove();

        const width = container.clientWidth;
        const height = container.clientHeight;

        this.visGroup = svg.append('g');
        this.linkGroup = this.visGroup.append('g').attr('class', 'links');
        this.nodeGroup = this.visGroup.append('g').attr('class', 'nodes');
        this.particleGroup = this.visGroup.append('g').attr('class', 'particles');

        // Phones change size when rotated or when the browser chrome
        // expands and collapses. Without this, the force center stays at
        // the old container center and the network ends up off-center
        // after a rotation. setup() runs on every game start, so drop
        // any observer from the previous game first.
        if (this.resizeObserver) this.resizeObserver.disconnect();
        this.resizeObserver = new ResizeObserver(() => this.recenter());
        this.resizeObserver.observe(container);

        const view = this;
        const zoom = d3
            .zoom()
            .scaleExtent([0.3, 7])
            .on('zoom', (event) => view.visGroup.attr('transform', event.transform));
        svg.call(zoom);

        this.simulation = d3
            .forceSimulation()
            .force('link', d3.forceLink().id((d) => d.id).distance(50).strength(0.5))
            .force('charge', d3.forceManyBody().strength(-100))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(12));

        this.simulation.on('tick', () => {
            this.nodeGroup
                .selectAll('g.node-group')
                .attr('transform', (d) => `translate(${d.x},${d.y})`);
            this.linkGroup
                .selectAll('line')
                .attr('x1', (d) => d.source.x)
                .attr('y1', (d) => d.source.y)
                .attr('x2', (d) => d.target.x)
                .attr('y2', (d) => d.target.y);
        });
    }

    update(nodes, links, isInitial = false) {
        const view = this;
        const drag = d3
            .drag()
            .on('start', (event, d) => {
                if (!event.active) view.simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) view.simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            });

        // Update nodes. Each node is a <g> holding a state-colored circle (which
        // doubles as the fallback if a sprite fails to load) plus a centered
        // <image> sprite for the node's state. The group is translated on tick.
        const node = this.nodeGroup.selectAll('g.node-group').data(nodes, (d) => d.id);

        node.exit().transition().duration(500).style('opacity', 0).remove();

        const entered = node
            .enter()
            .append('g')
            .attr('class', 'node-group')
            .attr('transform', (d) => `translate(${d.x},${d.y})`)
            .on('click', (event, d) => view.onNodeClick(event, d))
            .on('mouseover', function () {
                const group = d3.select(this);
                group.select('circle').transition().duration(150).attr('r', 12);
                group
                    .select('image')
                    .transition()
                    .duration(150)
                    .attr('width', SPRITE_HOVER_SIZE)
                    .attr('height', SPRITE_HOVER_SIZE)
                    .attr('x', -SPRITE_HOVER_SIZE / 2)
                    .attr('y', -SPRITE_HOVER_SIZE / 2);
            })
            .on('mouseout', function () {
                const group = d3.select(this);
                group.select('circle').transition().duration(150).attr('r', 7);
                group
                    .select('image')
                    .transition()
                    .duration(150)
                    .attr('width', SPRITE_SIZE)
                    .attr('height', SPRITE_SIZE)
                    .attr('x', -SPRITE_SIZE / 2)
                    .attr('y', -SPRITE_SIZE / 2);
            })
            .call(drag);

        entered.append('circle').attr('class', (d) => `node ${d.state}`).attr('r', 0);

        // Transparent hit target, appended after the visible circle so
        // the hover and state transitions that select('circle') still
        // target the visible one. The sprite already has pointer-events
        // none, so this circle is the tap target on phones.
        entered
            .append('circle')
            .attr('class', 'node-hit')
            .attr('r', NODE_HIT_RADIUS)
            .attr('fill', 'transparent');

        entered
            .append('image')
            .attr('class', 'node-sprite')
            .attr('href', (d) => spriteFor(d.state))
            .attr('width', 0)
            .attr('height', 0)
            .attr('x', 0)
            .attr('y', 0)
            // pointer-events:none keeps the underlying circle as the hit target,
            // so the existing .node:hover CSS and fallback rendering keep working.
            .style('pointer-events', 'none')
            // If a sprite fails to load, hide the broken image so the
            // state-colored circle beneath serves as the fallback.
            .on('error', function () {
                d3.select(this).style('display', 'none');
            });

        const merged = node.merge(entered);
        merged.attr('transform', (d) => `translate(${d.x},${d.y})`);

        const nodeTransition = merged
            .transition()
            .duration(isInitial ? 500 : 250)
            .delay((d, i) => (isInitial ? i * 10 : 0));

        nodeTransition
            .select('circle')
            .attr('r', 7)
            .attr('class', (d) => `node ${d.state}`);

        nodeTransition
            .select('image')
            .attr('href', (d) => spriteFor(d.state))
            .attr('width', SPRITE_SIZE)
            .attr('height', SPRITE_SIZE)
            .attr('x', -SPRITE_SIZE / 2)
            .attr('y', -SPRITE_SIZE / 2);

        // Update links
        const link = this.linkGroup
            .selectAll('line')
            .data(links, (d) => `${d.source.id}-${d.target.id}`);

        link.exit().transition().duration(300).style('stroke-opacity', 0).remove();

        link.enter().append('line').attr('class', 'link').on('click', (event, d) => view.onLinkClick(event, d));

        // Update simulation
        this.simulation.nodes(nodes);
        this.simulation.force('link').links(links);
        if (!isInitial) this.simulation.alpha(0.3).restart();
    }

    animateVirus(source, target) {
        const particle = this.particleGroup
            .append('circle')
            .attr('class', 'virus-particle')
            .attr('r', 4)
            .attr('cx', source.x)
            .attr('cy', source.y);

        particle
            .transition()
            .duration(1000)
            .attr('cx', target.x)
            .attr('cy', target.y)
            .on('end', function () {
                d3.select(this).remove();
            });
    }

    // Move the force center to the container's current center after a
    // resize (rotation, browser chrome). Skips restarting while paused
    // so a resize never silently unpauses the game; the recenter applies
    // on the next resume instead.
    recenter() {
        if (!this.simulation) return;
        const container = document.querySelector('.network-container');
        if (!container) return;
        const center = this.simulation.force('center');
        if (center) center.x(container.clientWidth / 2).y(container.clientHeight / 2);
        if (!this.paused) this.simulation.alpha(0.2).restart();
    }

    setPaused(paused) {
        this.paused = paused;
        if (!this.simulation) return;
        if (paused) this.simulation.stop();
        else this.simulation.alpha(0.3).restart();
    }
}
