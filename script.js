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

    // GRAND ATLAS + 3D AERIAL OVERFLIGHT & ZENITHAL DIVE CAMERA
    let isReadingMode = false;
    let activeExpandedBlock = null;
    let hasAtlas = false;
    let currentStep = null;
    let atlasCamera = null;
    let loupeReticle = null;
    let flightRaf = null;
    let lastFrameTime = 0;
    let flightInitialized = false;
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const camState = {
        x: 1800,
        y: 1200,
        zoom: 1.0,
        pitch: 0,
        bank: 0,
        screenX: window.innerWidth * 0.5,
        screenY: window.innerHeight * 0.5,
        baseScale: 0.35
    };

    const camTarget = { ...camState };

    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function getStepCam(step, vw, vh) {
        const isDesktop = vw >= 1024;
        const isHero = step.classList.contains('hero');
        return {
            x: parseFloat(step.getAttribute('data-cam-x')) || 1800,
            y: parseFloat(step.getAttribute('data-cam-y')) || 1200,
            zoom: parseFloat(step.getAttribute('data-cam-zoom')) || 1.0,
            isHero,
            screenX: (isDesktop && !isHero) ? vw * 0.68 : vw * 0.50,
            screenY: vh * 0.50,
            baseScale: Math.min(vw / 3600, vh / 2400) * (isHero ? 0.94 : 0.90)
        };
    }

    function computeFlightTarget() {
        if (!hasAtlas || steps.length === 0) return;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const anchorY = vh * 0.5;

        const centers = steps.map(s => {
            const r = s.getBoundingClientRect();
            return r.top + r.height * 0.5;
        });

        let idxA = 0;
        let idxB = 0;
        let rawT = 0;

        if (anchorY <= centers[0]) {
            idxA = 0;
            idxB = 0;
            rawT = 0;
        } else if (anchorY >= centers[centers.length - 1]) {
            idxA = steps.length - 1;
            idxB = steps.length - 1;
            rawT = 0;
        } else {
            for (let i = 0; i < centers.length - 1; i++) {
                if (anchorY >= centers[i] && anchorY <= centers[i + 1]) {
                    idxA = i;
                    idxB = i + 1;
                    const span = Math.max(1, centers[i + 1] - centers[i]);
                    rawT = clamp((anchorY - centers[i]) / span, 0, 1);
                    break;
                }
            }
        }

        const a = getStepCam(steps[idxA], vw, vh);
        const b = getStepCam(steps[idxB], vw, vh);

        // Landing dwell zone: flat & zenithal while centered on a section
        const dwell = 0.14;
        let u = 0;
        if (idxA === idxB || rawT <= dwell) {
            u = 0;
        } else if (rawT >= 1 - dwell) {
            u = 1;
        } else {
            u = (rawT - dwell) / (1 - 2 * dwell);
        }

        const easePos = u * u * (3 - 2 * u);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const zoomDiff = Math.abs(b.zoom - a.zoom);
        const shouldFly = !prefersReducedMotion && (dist > 60 || zoomDiff > 0.35);

        const rawArc = shouldFly ? Math.sin(Math.PI * u) : 0;
        const arc = rawArc > 0 ? Math.pow(rawArc, 0.82) : 0;

        const distFactor = clamp(dist / 2200, 0.45, 1.15);
        const baseZoom = lerp(a.zoom, b.zoom, easePos);

        // Lift off to aerial altitude mid-flight, then dive zenithally onto the target
        const cruiseZoom = Math.min(baseZoom, Math.max(0.92, 1.48 - distFactor * 0.42));
        const finalZoom = (a.isHero && b.isHero)
            ? baseZoom
            : lerp(baseZoom, cruiseZoom, arc);

        // Retro 3D overflight pitch (rotateX) + gentle aircraft bank (rotateZ)
        const maxPitch = (a.isHero || b.isHero) ? 38 : (38 + distFactor * 14);
        const pitch = shouldFly ? maxPitch * arc : 0;
        const bankDir = clamp(dx / 1400, -1, 1);
        const bank = shouldFly ? (-bankDir * 9.5 * arc) : 0;

        camTarget.x = lerp(a.x, b.x, easePos);
        camTarget.y = lerp(a.y, b.y, easePos);
        camTarget.zoom = finalZoom;
        camTarget.pitch = pitch;
        camTarget.bank = bank;
        camTarget.screenX = lerp(a.screenX, b.screenX, easePos);
        camTarget.screenY = lerp(a.screenY, b.screenY, easePos) + (vh * 0.045 * arc);
        camTarget.baseScale = lerp(a.baseScale, b.baseScale, easePos);
    }

    function renderAtlasCamera() {
        if (!hasAtlas || !atlasCamera || !atlasCanvas) return;
        const finalScale = camState.baseScale * camState.zoom;
        const pitch = Math.abs(camState.pitch) < 0.08 ? 0 : camState.pitch;
        const bank = Math.abs(camState.bank) < 0.05 ? 0 : camState.bank;

        atlasCamera.style.transform =
            `translate3d(${camState.screenX.toFixed(1)}px, ${camState.screenY.toFixed(1)}px, 0) ` +
            `perspective(1100px) ` +
            `rotateX(${pitch.toFixed(2)}deg) ` +
            `rotateZ(${bank.toFixed(2)}deg) ` +
            `scale(${finalScale.toFixed(4)})`;

        atlasCanvas.style.transform =
            `translate3d(${(-camState.x).toFixed(1)}px, ${(-camState.y).toFixed(1)}px, 0)`;

        const isFlying = pitch > 3.0;
        if (loupeReticle) {
            loupeReticle.classList.toggle('is-flying', isFlying);
        }

        if (scaleMetric && currentStep) {
            const narrativeMetric = currentStep.getAttribute('data-metric') || 1;
            if (isFlying) {
                scaleMetric.innerHTML = `VUELO ${camState.zoom.toFixed(1)}× · ${Math.round(pitch)}°<br>ESCALA 1:${narrativeMetric}`;
            } else {
                scaleMetric.innerHTML = `CENIT ${camState.zoom.toFixed(1)}×<br>ESCALA 1:${narrativeMetric}`;
            }
        }
    }

    function tickFlight(now) {
        if (!lastFrameTime) lastFrameTime = now;
        const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
        lastFrameTime = now;

        if (!isReadingMode) {
            computeFlightTarget();
        }

        const k = 1 - Math.exp(-dt * 6.8);
        camState.x = lerp(camState.x, camTarget.x, k);
        camState.y = lerp(camState.y, camTarget.y, k);
        camState.zoom = lerp(camState.zoom, camTarget.zoom, k);
        camState.pitch = lerp(camState.pitch, camTarget.pitch, k);
        camState.bank = lerp(camState.bank, camTarget.bank, k);
        camState.screenX = lerp(camState.screenX, camTarget.screenX, k);
        camState.screenY = lerp(camState.screenY, camTarget.screenY, k);
        camState.baseScale = lerp(camState.baseScale, camTarget.baseScale, k);

        renderAtlasCamera();

        const settled =
            Math.abs(camState.x - camTarget.x) < 0.4 &&
            Math.abs(camState.y - camTarget.y) < 0.4 &&
            Math.abs(camState.zoom - camTarget.zoom) < 0.002 &&
            Math.abs(camState.pitch - camTarget.pitch) < 0.05 &&
            Math.abs(camState.bank - camTarget.bank) < 0.05 &&
            Math.abs(camState.screenX - camTarget.screenX) < 0.4 &&
            Math.abs(camState.screenY - camTarget.screenY) < 0.4;

        if (!settled) {
            flightRaf = requestAnimationFrame(tickFlight);
        } else {
            Object.assign(camState, camTarget);
            renderAtlasCamera();
            flightRaf = null;
            lastFrameTime = 0;
        }
    }

    function wakeFlight(snap = false) {
        if (!hasAtlas) return;
        computeFlightTarget();
        if (snap || !flightInitialized) {
            Object.assign(camState, camTarget);
            flightInitialized = true;
            renderAtlasCamera();
            return;
        }
        if (!flightRaf) {
            lastFrameTime = 0;
            flightRaf = requestAnimationFrame(tickFlight);
        }
    }

    if (atlasViewport && atlasCanvas) {
        const atlasUrl = atlasViewport.getAttribute('data-atlas');
        if (atlasUrl) {
            hasAtlas = true;
            body.classList.add('has-atlas');

            // Wrap atlasCanvas inside a 3D camera rig centered at (camX, camY)
            atlasCamera = document.createElement('div');
            atlasCamera.className = 'atlas-camera';
            atlasViewport.insertBefore(atlasCamera, atlasCanvas);
            atlasCamera.appendChild(atlasCanvas);

            loupeReticle = document.createElement('div');
            loupeReticle.className = 'loupe-reticle';
            atlasViewport.appendChild(loupeReticle);

            fetch(atlasUrl)
                .then(r => r.text())
                .then(svgText => {
                    atlasCanvas.innerHTML = svgText;
                    wakeFlight(true);
                })
                .catch(err => console.error('Atlas SVG load error:', err));
        }
    }

    function updateAtlasCamera(target) {
        if (!hasAtlas || !target) return;
        const isHero = target.classList.contains('hero');
        if (isHero) {
            body.classList.add('atlas-hero-view');
        } else {
            body.classList.remove('atlas-hero-view');
        }
        wakeFlight(false);
    }

    window.addEventListener('scroll', () => {
        if (hasAtlas && !isReadingMode) wakeFlight(false);
    }, { passive: true });

    window.addEventListener('resize', () => {
        if (hasAtlas) wakeFlight(true);
    }, { passive: true });

    // Create top reading progress bar
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    document.body.prepend(progressBar);

    // Create reading backdrop for closing modal by clicking outside
    const backdrop = document.createElement('div');
    backdrop.className = 'reading-backdrop';
    document.body.appendChild(backdrop);

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
