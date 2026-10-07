// ALL D3 touchpoints live in this file and nowhere else.
// NetworkView owns the force simulation, zoom, drag, data joins, transitions,
// and virus-particle animations. Node rendering reads node.state for its CSS class.
import * as d3 from 'd3';

export class NetworkView {
    constructor() {
        this.simulation = null;
        this.visGroup = null;
        this.linkGroup = null;
        this.nodeGroup = null;
        this.particleGroup = null;
        this.onNodeClick = null;
        this.onLinkClick = null;
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
            this.nodeGroup.selectAll('circle').attr('cx', (d) => d.x).attr('cy', (d) => d.y);
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

        // Update nodes
        const node = this.nodeGroup.selectAll('circle').data(nodes, (d) => d.id);

        node.exit().transition().duration(500).attr('r', 0).remove();

        node.enter()
            .append('circle')
            .attr('class', (d) => `node ${d.state}`)
            .attr('r', 0)
            .on('click', (event, d) => view.onNodeClick(event, d))
            .on('mouseover', function () {
                d3.select(this).transition().duration(150).attr('r', 12);
            })
            .on('mouseout', function () {
                d3.select(this).transition().duration(150).attr('r', 7);
            })
            .call(drag)
            .merge(node)
            .attr('cx', (d) => d.x)
            .attr('cy', (d) => d.y)
            .transition()
            .duration(isInitial ? 500 : 250)
            .delay((d, i) => (isInitial ? i * 10 : 0))
            .attr('r', 7)
            .attr('class', (d) => `node ${d.state}`);

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

    setPaused(paused) {
        if (!this.simulation) return;
        if (paused) this.simulation.stop();
        else this.simulation.alpha(0.3).restart();
    }
}
