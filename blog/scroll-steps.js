// Scroll-linked walk through a pipeline diagram: as the reader scrolls past the figure, an alert dot travels
// along each connector and the steps light up in order. Works on any inline SVG whose steps are marked
// <g class="dd-step" data-step="n"> and connectors <g class="dd-edge" data-step="n"> (n = the step it leads into).
// Without JS, or with reduced motion, the diagram simply shows complete.
(function () {
  if (!window.gsap || !window.ScrollTrigger || !window.MotionPathPlugin) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  gsap.registerPlugin(ScrollTrigger, MotionPathPlugin);

  const byStep = (els) => {
    const m = new Map();
    els.forEach((el) => {
      const k = Number(el.dataset.step);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(el);
    });
    return m;
  };

  // figures are created top to bottom, as ScrollTrigger expects
  document.querySelectorAll('.post-svg svg').forEach((svg) => {
    const steps = byStep(svg.querySelectorAll('.dd-step'));
    if (!steps.size) return;
    const edges = byStep(svg.querySelectorAll('.dd-edge'));
    const order = [...steps.keys()].sort((a, b) => a - b);

    // the travelling alert
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('r', '6');
    dot.setAttribute('fill', 'var(--accent)');
    dot.style.filter = 'drop-shadow(0 0 6px var(--accent))';
    svg.appendChild(dot);

    gsap.set([...svg.querySelectorAll('.dd-step, .dd-edge')], { opacity: 0.2 });
    gsap.set(dot, { opacity: 0 });

    const tl = gsap.timeline({
      scrollTrigger: { trigger: svg, start: 'top 75%', end: 'bottom 40%', scrub: 0.6 },
    });
    order.forEach((k, i) => {
      for (const edge of edges.get(k) || []) {
        tl.to(edge, { opacity: 1, duration: 0.3 });
        const shape = edge.querySelector('path, line, polyline');
        if (shape) {
          const path = shape.tagName === 'path' ? shape : MotionPathPlugin.convertToPath(shape, false)[0];
          tl.to(dot, { opacity: 1, duration: 0.05 }, '<');
          tl.to(dot, {
            duration: 0.6,
            ease: 'none',
            motionPath: { path, align: path, alignOrigin: [0.5, 0.5] },
          }, '<');
        }
      }
      tl.to(steps.get(k), { opacity: 1, duration: 0.3 }, i === 0 ? 0 : '>-0.1');
    });
    tl.to(dot, { opacity: 0, duration: 0.2 });
  });
})();
