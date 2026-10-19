document.addEventListener("DOMContentLoaded", () => {
    const steps = document.querySelectorAll('.step');
    const scaleObject = document.getElementById('scale-object');
    const bgLayers = document.querySelectorAll('.bg-layer');
    const scaleMetric = document.getElementById('scale-metric');
    const body = document.body;

    // Trigger intersection exactly when the middle of the section hits the middle of the screen
    const observerOptions = {
        root: null,
        rootMargin: '-50% 0px -50% 0px',
        threshold: 0
    };

    let isReadingMode = false;

    const observer = new IntersectionObserver((entries) => {
        if (isReadingMode) return; // Freeze background updates while reading
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Activate step
                steps.forEach(s => s.classList.remove('is-active'));
                entry.target.classList.add('is-active');

                // Get data attributes
                const renderScale = entry.target.getAttribute('data-scale') || 1;
                const narrativeMetric = entry.target.getAttribute('data-metric') || 1;
                const shape = entry.target.getAttribute('data-shape') || 'square';
                const invert = entry.target.getAttribute('data-invert') === 'true';
                const targetLayer = entry.target.getAttribute('data-layer') || 'grid';

                // CROSSFADING LAYERS
                bgLayers.forEach(layer => {
                    if (layer.id === `bg-${targetLayer}`) {
                        layer.classList.add('is-active');
                    } else {
                        layer.classList.remove('is-active');
                    }
                    // Scale all backgrounds gracefully so there's no popping during transition
                    const bgScale = Math.max(0.5, renderScale);
                    layer.style.transform = `scale(${bgScale})`;
                });

                // Update visual scale object
                scaleObject.style.transform = `scale(${renderScale})`;
                scaleObject.className = `scale-object ${shape}`;

                // Update metric UI with NARRATIVE scale
                scaleMetric.innerHTML = `SCALE: <br>1:${narrativeMetric}`;

                // Invert colors if needed
                if (invert) {
                    body.classList.add('invert');
                } else {
                    body.classList.remove('invert');
                }
            }
        });
    }, observerOptions);

    steps.forEach(step => observer.observe(step));

    // READING MODE LOGIC
    document.querySelectorAll('.expand-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const textBlock = e.target.closest('.text-block');
            textBlock.classList.add('expanded');
            body.classList.add('is-reading-mode');
            isReadingMode = true;
            // Scroll to top of the expanded block
            textBlock.scrollTop = 0;
        });
    });

    document.querySelectorAll('.collapse-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const textBlock = e.target.closest('.text-block');
            textBlock.classList.remove('expanded');
            body.classList.remove('is-reading-mode');
            isReadingMode = false;
        });
    });

    // DROPDOWN LOGIC
    const dropdown = document.querySelector('.ui-top-right.dropdown');
    if (dropdown) {
        const trigger = dropdown.querySelector('.dropdown-trigger');
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('is-open');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target)) {
                dropdown.classList.remove('is-open');
            }
        });
    }

    // INDIVIDUAL SECTION LINKING & DEEP NAVIGATION
    steps.forEach((step) => {
        const h2 = step.querySelector('h2');
        const secId = step.getAttribute('id') || step.getAttribute('data-sec');
        if (h2 && secId && !h2.querySelector('.section-link-btn')) {
            const titleSpan = document.createElement('span');
            titleSpan.textContent = h2.textContent;
            h2.textContent = '';
            h2.appendChild(titleSpan);

            const linkBtn = document.createElement('button');
            linkBtn.type = 'button';
            linkBtn.className = 'section-link-btn';
            linkBtn.title = 'Copiar enlace directo a esta sección';
            linkBtn.textContent = '[#]';
            linkBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = new URL(window.location.href);
                url.hash = secId;
                window.history.replaceState(null, '', url.toString());
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(url.toString());
                }
                linkBtn.textContent = '[ENLACE COPIADO]';
                setTimeout(() => { linkBtn.textContent = '[#]'; }, 1600);
            });
            h2.appendChild(linkBtn);
        }
    });

    function navigateToHashSection() {
        const rawHash = decodeURIComponent(window.location.hash || '').replace(/^#/, '');
        if (!rawHash) return;
        const target = document.getElementById(rawHash) || document.querySelector(`.step[data-sec="${rawHash}"]`);
        if (target) {
            setTimeout(() => {
                steps.forEach(s => s.classList.remove('is-active'));
                target.classList.add('is-active');
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const params = new URLSearchParams(window.location.search);
                if (params.get('expand') === '1') {
                    const expandBtn = target.querySelector('.expand-btn');
                    if (expandBtn) expandBtn.click();
                }
            }, 250);
        }
    }

    navigateToHashSection();
    window.addEventListener('hashchange', navigateToHashSection);
});
