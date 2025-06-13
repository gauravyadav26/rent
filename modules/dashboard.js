// Dashboard module
export function initialize() {
    console.log('Initializing dashboard module...');
    updateDashboardStats();
    setupDashboardEventListeners();
}

function setupDashboardEventListeners() {
    // Add any dashboard-specific event listeners here
    const refreshButton = document.getElementById('refreshStats');
    if (refreshButton) {
        refreshButton.addEventListener('click', updateDashboardStats);
    }
}

export function calculateDashboardStats() {
    const currentPlot = getCurrentPlot();
    const tenants = getTenants(currentPlot);
    
    return {
        total: tenants.length,
        active: tenants.filter(t => t.status === 'Active').length,
        pending: tenants.filter(t => t.status === 'Pending').length,
        vacant: tenants.filter(t => t.status === 'Vacant').length
    };
}

export function updateDashboardStats() {
    const stats = calculateDashboardStats();
    const fragment = document.createDocumentFragment();
    
    Object.entries(stats).forEach(([key, value]) => {
        const element = document.getElementById(`${key}Count`);
        if (element) {
            element.textContent = value;
        }
    });
}

// Helper functions
function getCurrentPlot() {
    const activeTab = document.querySelector('.plot-tab.active');
    return activeTab ? activeTab.textContent.trim() : 'Plot 1';
}

function getTenants(plot) {
    const plotKey = `tenants_${plot}`;
    return JSON.parse(localStorage.getItem(plotKey) || '[]');
} 