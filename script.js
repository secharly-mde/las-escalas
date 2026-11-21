document.addEventListener("DOMContentLoaded", () => {
    const steps = Array.from(document.querySelectorAll('.step'));
    const readableSteps = steps.filter(s => s.querySelector('.expand-btn'));
    const scaleObject = document.getElementById('scale-object');
    const bgGrid = document.getElementById('bg-grid');
    const bgPlate = document.getElementById('bg-plate');
    const atlasViewport = document.getElementById('atlas-viewport');
    const atlasCanvas = document.getElementById('atlas-canvas');
    const scaleMetric = document.getElementById('scale-metric');
    const scrollIndicator = document.getElementById('scroll-indicator');
    const body = document.body;

    // GRAND ATLAS + KINETIC LOUPE CAMERA INITIALIZATION
    let hasAtlas = false;
    let currentStep = null;

    if (atlasViewport && atlasCanvas) {
        const atlasUrl = atlasViewport.getAttribute('data-atlas');
        if (atlasUrl) {
            hasAtlas = true;
            body.classList.add('has-atlas');
            const reticle = document.createElement('div');
            reticle.className = 'loupe-reticle';
            atlasViewport.appendChild(reticle);

            fetch(atlasUrl)
                .then(r => r.text())
                .then(svgText => {
                    atlasCanvas.innerHTML = svgText;
                    if (currentStep) updateAtlasCamera(currentStep);
                })
                .catch(err => console.error('Atlas SVG load error:', err));
        }
    }

    function updateAtlasCamera(target) {
        if (!hasAtlas || !atlasCanvas || !target) return;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const isDesktop = vw >= 1024;
        const isHero = target.classList.contains('hero');

        if (isHero) {
            body.classList.add('atlas-hero-view');
        } else {
            body.classList.remove('atlas-hero-view');
        }

        const camX = parseFloat(target.getAttribute('data-cam-x')) || 1800;
        const camY = parseFloat(target.getAttribute('data-cam-y')) || 1200;
        const camZoom = parseFloat(target.getAttribute('data-cam-zoom')) || 1.0;

        // Fit-base scale so zoom=1.0 frames the whole 3600x2400 Grand Atlas comfortably
        const baseScale = Math.min(vw / 3600, vh / 2400) * (isHero ? 0.94 : 0.90);
        const finalScale = baseScale * camZoom;

        // On desktop sections, focus the loupe on the open right stage (68% X); on hero/mobile, center (50% X)
        const targetScreenX = (isDesktop && !isHero) ? vw * 0.68 : vw * 0.50;
        const targetScreenY = vh * 0.50;

        const tx = targetScreenX - camX * finalScale;
        const ty = targetScreenY - camY * finalScale;

        atlasCanvas.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${finalScale.toFixed(4)})`;

        if (scaleMetric) {
            const narrativeMetric = target.getAttribute('data-metric') || 1;
            scaleMetric.innerHTML = `LUPA ${camZoom.toFixed(1)}×<br>ESCALA 1:${narrativeMetric}`;
        }
    }

    window.addEventListener('resize', () => {
        if (hasAtlas && currentStep) updateAtlasCamera(currentStep);
    }, { passive: true });

    // Create top reading progress bar
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    document.body.prepend(progressBar);

    // Create reading backdrop for closing modal by clicking outside
    const backdrop = document.createElement('div');
    backdrop.className = 'reading-backdrop';
    document.body.appendChild(backdrop);

    let isReadingMode = false;
    let activeExpandedBlock = null;

    // Smooth logarithmic mapping so kinetic zoom-in / zoom-out feels deep & dramatic
    // without ever pixelating the background plate or breaking layout!
    function computeKineticTransforms(rawScale) {
        const val = Math.max(0.0001, parseFloat(rawScale) || 1);
        const logS = Math.log10(val); // roughly -4 to +2
        // Scale object moves dramatically (0.28x to 3.4x)
        const objScale = Math.max(0.28, Math.min(3.4, Math.pow(1.65, logS)));
        // Architectural grid zooms noticeably (0.65x to 1.85x)
        const gridScale = Math.max(0.65, Math.min(1.85, 1 + logS * 0.22));
        // Official chapter plate breathes/zooms gracefully (0.86x to 1.24x)
        const plateScale = Math.max(0.86, Math.min(1.24, 1 + logS * 0.085));
        return { objScale, gridScale, plateScale };
    }

    function updateProgressBar() {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const pct = docHeight > 0 ? Math.min(100, Math.max(0, (scrollTop / docHeight) * 100)) : 0;
        progressBar.style.width = `${pct}%`;
    }
    window.addEventListener('scroll', updateProgressBar, { passive: true });
    updateProgressBar();

    // Activate step visual state
    function activateStep(target) {
        currentStep = target;
        steps.forEach(s => s.classList.remove('is-active'));
        target.classList.add('is-active');

        const renderScale = target.getAttribute('data-scale') || 1;
        const narrativeMetric = target.getAttribute('data-metric') || 1;
        const shape = target.getAttribute('data-shape') || 'square';
        const invert = target.getAttribute('data-invert') === 'true';

        const { objScale, gridScale, plateScale } = computeKineticTransforms(renderScale);

        if (bgGrid) {
            bgGrid.style.transform = `scale(${gridScale.toFixed(3)})`;
        }
        if (hasAtlas) {
            updateAtlasCamera(target);
        } else {
            if (bgPlate) {
                bgPlate.style.transform = `scale(${plateScale.toFixed(3)})`;
            }
            if (scaleObject) {
                scaleObject.style.transform = `scale(${objScale.toFixed(3)})`;
                scaleObject.className = `scale-object ${shape}`;
            }
            if (scaleMetric) {
                scaleMetric.innerHTML = `ESCALA<br>1:${narrativeMetric}`;
            }
        }

        // Update bottom-left indicator with real section progress
        if (scrollIndicator) {
            const h2 = target.querySelector('h2 span') || target.querySelector('h2');
            if (target.classList.contains('hero')) {
                scrollIndicator.textContent = 'DESPLAZAR ↓';
            } else if (h2 && readableSteps.length > 0) {
                const idx = readableSteps.indexOf(target);
                const padIdx = String(idx + 1).padStart(2, '0');
                const padTot = String(readableSteps.length).padStart(2, '0');
                scrollIndicator.textContent = `${padIdx} / ${padTot} · ${h2.textContent.trim()}`;
            } else {
                const idx = steps.indexOf(target);
                scrollIndicator.textContent = `${String(idx).padStart(2, '0')} / ${String(steps.length - 1).padStart(2, '0')}`;
            }
        }

        if (invert) {
            body.classList.add('invert');
        } else {
            body.classList.remove('invert');
        }
    }

    const observerOptions = {
        root: null,
        rootMargin: '-45% 0px -45% 0px',
        threshold: 0
    };

    const observer = new IntersectionObserver((entries) => {
        if (isReadingMode) return;
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                activateStep(entry.target);
            }
        });
    }, observerOptions);

    steps.forEach(step => observer.observe(step));
    if (steps.length > 0) {
        activateStep(steps[0]);
    }

    // READING MODE LOGIC
    function openReadingMode(textBlock) {
        if (!textBlock) return;
        if (activeExpandedBlock && activeExpandedBlock !== textBlock) {
            activeExpandedBlock.classList.remove('expanded');
            const oldStep = activeExpandedBlock.closest('.step');
            if (oldStep) oldStep.classList.remove('is-reading-step');
        }
        const parentStep = textBlock.closest('.step');
        if (parentStep) {
            parentStep.classList.add('is-active');
            parentStep.classList.add('is-reading-step');
        }
        textBlock.classList.add('expanded');
        body.classList.add('is-reading-mode');
        isReadingMode = true;
        activeExpandedBlock = textBlock;
        textBlock.scrollTop = 0;
    }

    function closeReadingMode() {
        if (activeExpandedBlock) {
            activeExpandedBlock.classList.remove('expanded');
            const oldStep = activeExpandedBlock.closest('.step');
            if (oldStep) oldStep.classList.remove('is-reading-step');
            activeExpandedBlock = null;
        }
        body.classList.remove('is-reading-mode');
        isReadingMode = false;
    }

    // Inject in-modal Prev / Next section buttons for seamless continuous reading
    readableSteps.forEach((step, idx) => {
        const textBlock = step.querySelector('.text-block');
        if (!textBlock || textBlock.querySelector('.modal-sec-nav')) return;

        const navRow = document.createElement('div');
        navRow.className = 'modal-sec-nav';

        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'modal-nav-btn';
        prevBtn.textContent = '← SECCIÓN ANTERIOR';
        prevBtn.disabled = (idx === 0);
        prevBtn.addEventListener('click', () => {
            if (idx > 0) {
                const prevStep = readableSteps[idx - 1];
                closeReadingMode();
                activateStep(prevStep);
                prevStep.scrollIntoView({ behavior: 'instant', block: 'center' });
                openReadingMode(prevStep.querySelector('.text-block'));
            }
        });

        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'modal-nav-btn';
        nextBtn.textContent = 'SIGUIENTE SECCIÓN →';
        nextBtn.disabled = (idx === readableSteps.length - 1);
        nextBtn.addEventListener('click', () => {
            if (idx < readableSteps.length - 1) {
                const nextStep = readableSteps[idx + 1];
                closeReadingMode();
                activateStep(nextStep);
                nextStep.scrollIntoView({ behavior: 'instant', block: 'center' });
                openReadingMode(nextStep.querySelector('.text-block'));
            }
        });

        navRow.appendChild(prevBtn);
        navRow.appendChild(nextBtn);
        textBlock.appendChild(navRow);
    });

    document.querySelectorAll('.expand-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const textBlock = e.target.closest('.text-block');
            openReadingMode(textBlock);
        });
    });

    document.querySelectorAll('.collapse-btn').forEach(btn => {
        btn.addEventListener('click', () => closeReadingMode());
    });

    backdrop.addEventListener('click', () => closeReadingMode());
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isReadingMode) {
            closeReadingMode();
        }
    });

    // DROPDOWN LOGIC + HIGHLIGHT CURRENT CHAPTER
    const dropdown = document.querySelector('.ui-top-right.dropdown');
    if (dropdown) {
        const trigger = dropdown.querySelector('.dropdown-trigger');
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('is-open');
        });
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target)) {
                dropdown.classList.remove('is-open');
            }
        });

        const currentFile = window.location.pathname.split('/').pop() || 'index.html';
        dropdown.querySelectorAll('.dropdown-content a').forEach(a => {
            if (a.getAttribute('href') === currentFile) {
                a.classList.add('is-current');
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
                linkBtn.textContent = '[COPIADO]';
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
                activateStep(target);
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
