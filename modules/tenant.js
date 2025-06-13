// Tenant module
export function initialize() {
    console.log('Initializing tenant module...');
    setupTenantEventListeners();
    initializeTenantList();
}

function setupTenantEventListeners() {
    const addTenantBtn = document.getElementById('addTenantBtn');
    if (addTenantBtn) {
        addTenantBtn.addEventListener('click', showAddTenantModal);
    }

    const tenantForm = document.getElementById('tenantForm');
    if (tenantForm) {
        tenantForm.addEventListener('submit', handleTenantSubmit);
    }

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(handleSearch, 300));
    }
}

function initializeTenantList() {
    const tenantList = document.getElementById('tenantList');
    if (!tenantList) return;

    const ITEM_HEIGHT = 100;
    new VirtualizedList(
        tenantList,
        ITEM_HEIGHT,
        getTenants(getCurrentPlot()).length,
        renderTenantItem
    );
}

function renderTenantItem(index) {
    const tenant = getTenants(getCurrentPlot())[index];
    if (!tenant) return document.createElement('div');
    
    const div = document.createElement('div');
    div.className = 'tenant-card';
    div.innerHTML = `
        <h3>${tenant.tenantName}</h3>
        <p>Room: ${tenant.roomNumber}</p>
        <p>Status: ${tenant.status}</p>
        <div class="tenant-actions">
            <button onclick="editTenant('${tenant.id}')" class="edit-btn">Edit</button>
            <button onclick="deleteTenant('${tenant.id}')" class="delete-btn">Delete</button>
        </div>
    `;
    return div;
}

function handleSearch(e) {
    const searchTerm = e.target.value.toLowerCase();
    filterTenants(searchTerm);
}

function filterTenants(searchTerm) {
    const tenants = getTenants(getCurrentPlot());
    const filteredTenants = tenants.filter(tenant => 
        tenant.tenantName.toLowerCase().includes(searchTerm) ||
        tenant.roomNumber.toLowerCase().includes(searchTerm)
    );
    displayTenants(filteredTenants);
}

function showAddTenantModal() {
    const modal = document.getElementById('tenantModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

async function handleTenantSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const tenantData = {
        id: Date.now().toString(),
        tenantName: formData.get('tenantName'),
        roomNumber: formData.get('roomNumber'),
        status: formData.get('status'),
        plotName: getCurrentPlot()
    };

    try {
        await saveTenant(tenantData);
        closeModal('tenantModal');
        e.target.reset();
        initializeTenantList();
    } catch (error) {
        console.error('Error saving tenant:', error);
        alert('Failed to save tenant. Please try again.');
    }
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

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// VirtualizedList class
class VirtualizedList {
    constructor(container, itemHeight, totalItems, renderItem) {
        this.container = container;
        this.itemHeight = itemHeight;
        this.totalItems = totalItems;
        this.renderItem = renderItem;
        this.visibleItems = Math.ceil(container.clientHeight / itemHeight);
        this.scrollTop = 0;
        this.setupVirtualization();
    }

    setupVirtualization() {
        this.container.style.position = 'relative';
        this.container.style.overflow = 'auto';
        this.container.style.height = `${this.totalItems * this.itemHeight}px`;
        
        this.container.addEventListener('scroll', debounce(() => {
            this.scrollTop = this.container.scrollTop;
            this.render();
        }, 16));
        
        this.render();
    }

    render() {
        const startIndex = Math.floor(this.scrollTop / this.itemHeight);
        const endIndex = Math.min(startIndex + this.visibleItems + 1, this.totalItems);
        
        this.container.innerHTML = '';
        const fragment = document.createDocumentFragment();
        
        for (let i = startIndex; i < endIndex; i++) {
            const item = this.renderItem(i);
            item.style.position = 'absolute';
            item.style.top = `${i * this.itemHeight}px`;
            item.style.width = '100%';
            fragment.appendChild(item);
        }
        
        this.container.appendChild(fragment);
    }
} 