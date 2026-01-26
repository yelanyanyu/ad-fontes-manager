// Resizer Logic
export function initResizer(resizerId, leftPanelId, containerId) {
    const resizer = document.getElementById(resizerId);
    const leftPanel = document.getElementById(leftPanelId);
    const mainContainer = document.getElementById(containerId);
    let isResizing = false;

    if (!resizer || !leftPanel || !mainContainer) return;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizer.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const containerRect = mainContainer.getBoundingClientRect();
        const pointerRelativeX = e.clientX - containerRect.left;
        
        // Convert to percentage
        let newWidthPercent = (pointerRelativeX / containerRect.width) * 100;
        
        // Constrain (e.g., 20% to 80%)
        if(newWidthPercent < 20) newWidthPercent = 20;
        if(newWidthPercent > 80) newWidthPercent = 80;
        
        leftPanel.style.width = `${newWidthPercent}%`;
    });

    document.addEventListener('mouseup', () => {
        if(isResizing) {
            isResizing = false;
            resizer.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

// Navigation Active State (Dark Sidebar Version)
export function updateNavState() {
    const path = window.location.pathname;
    const navLinks = document.querySelectorAll('nav a');
    navLinks.forEach(link => {
        if (link.getAttribute('href') === path || (path === '/' && link.getAttribute('href') === '/words')) {
            link.classList.add('bg-slate-800', 'text-white');
            link.classList.remove('text-slate-400', 'hover:text-white');
        } else {
            link.classList.remove('bg-slate-800', 'text-white');
            link.classList.add('text-slate-400', 'hover:text-white', 'hover:bg-slate-800');
        }
    });
}
