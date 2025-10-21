// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAad_Ix_4Kw7dnwPpRUacXlxOZCG_HuZ-8",
    authDomain: "rent-ec3f3.firebaseapp.com",
    projectId: "rent-ec3f3",
    storageBucket: "rent-ec3f3.firebasestorage.app",
    messagingSenderId: "60600802638",
    appId: "1:60600802638:web:98b79bba0b1c971c72921f"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// Caching and optimization system
const CacheManager = {
    // In-memory cache for tenants data
    tenantCache: new Map(),
    
    // Cache timestamps for invalidation
    cacheTimestamps: new Map(),
    
    // Cache duration (15 minutes)
    CACHE_DURATION: 15 * 60 * 1000,
    
    // Pending changes that need to be synced
    pendingChanges: new Map(),
    
    // Batch operation queue
    batchQueue: [],
    
    // Initialize cache for a plot
    initCache(plot) {
        if (!this.tenantCache.has(plot)) {
            this.tenantCache.set(plot, []);
            this.cacheTimestamps.set(plot, 0);
        }
    },
    
    // Get cached data if valid
    getCachedData(plot) {
        this.initCache(plot);
        const timestamp = this.cacheTimestamps.get(plot);
        const now = Date.now();
        
        if (now - timestamp < this.CACHE_DURATION) {
            return this.tenantCache.get(plot);
        }
        return null;
    },
    
    // Set cached data
    setCachedData(plot, data) {
        this.tenantCache.set(plot, data);
        this.cacheTimestamps.set(plot, Date.now());
    },
    
    // Invalidate cache for a plot
    invalidateCache(plot) {
        this.cacheTimestamps.set(plot, 0);
    },
    
    // Add pending change
    addPendingChange(plot, tenantId, operation, data) {
        if (!this.pendingChanges.has(plot)) {
            this.pendingChanges.set(plot, new Map());
        }
        this.pendingChanges.get(plot).set(tenantId, { operation, data, timestamp: Date.now() });
    },
    
    // Get pending changes for a plot
    getPendingChanges(plot) {
        return this.pendingChanges.get(plot) || new Map();
    },
    
    // Clear pending changes for a plot
    clearPendingChanges(plot) {
        this.pendingChanges.delete(plot);
    },
    
    // Add to batch queue
    addToBatch(operation) {
        this.batchQueue.push(operation);
    },
    
    // Process batch queue
    async processBatch() {
        if (this.batchQueue.length === 0) return;
        
        const batch = db.batch();
        const operations = [...this.batchQueue];
        this.batchQueue = [];
        
        for (const op of operations) {
            const { type, path, data } = op;
            const docRef = db.doc(path);
            
            switch (type) {
                case 'set':
                    batch.set(docRef, data);
                    break;
                case 'update':
                    batch.update(docRef, data);
                    break;
                case 'delete':
                    batch.delete(docRef);
                    break;
            }
        }
        
        try {
            await batch.commit();
            console.log(`Batch processed ${operations.length} operations`);
        } catch (error) {
            console.error('Batch operation failed:', error);
            // Re-queue failed operations
            this.batchQueue.push(...operations);
        }
    }
};

// Debounce utility
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

// Add at the top of the file after Firebase config
let currentSearchTerm = '';
let tenantStatusFilter = 'active';

// Add PWA install prompt
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent automatic mini-infobar/prompts
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;

    // Show custom banner only if not already installed
    const banner = document.getElementById('install-banner');
    if (banner && !isAppInstalled()) banner.style.display = 'flex';
});

// Listen for successful installation
// Handle successful install – hide banner and clear prompt
document.getElementById('install-btn')?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log('User response to the install prompt:', outcome);
    deferredPrompt = null;
    document.getElementById('install-banner')?.remove();
});

document.getElementById('dismiss-install')?.addEventListener('click', () => {
    document.getElementById('install-banner')?.remove();
});

window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    // Hide install banner when app is installed
    const banner = document.getElementById('install-banner');
    if (banner) banner.style.display = 'none';
});

// Check if app is already installed
function isAppInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches || 
           window.navigator.standalone === true;
}

// Migrate tenant IDs to numbers
async function migrateTenantIds() {
    console.log('Starting tenant ID migration...');
    const plots = ['home', 'baba', 'shop', 'others'];
    
    for (const plot of plots) {
        const plotKey = getPlotStorageKey(plot);
        const tenants = JSON.parse(localStorage.getItem(plotKey) || '[]');
        let needsUpdate = false;
        
        // Check if any tenant has string ID
        tenants.forEach(tenant => {
            if (typeof tenant.id === 'string') {
                tenant.id = Number(tenant.id);
                needsUpdate = true;
            }
        });
        
        // Update localStorage if needed
        if (needsUpdate) {
            console.log(`Migrating tenant IDs for plot: ${plot}`);
            localStorage.setItem(plotKey, JSON.stringify(tenants));
            
            // Update Firebase if connected
            try {
                for (const tenant of tenants) {
                    await db.collection('tenants').doc(tenant.id.toString()).set(tenant);
                }
                console.log(`Successfully migrated tenant IDs for plot: ${plot}`);
            } catch (error) {
                console.error(`Error migrating tenant IDs to Firebase for plot ${plot}:`, error);
            }
        }
    }
    console.log('Tenant ID migration completed');
}

// Show tenant details modal
function showTenantDetails(tenantId) {
    const tenant = findTenant(tenantId);
    if (!tenant) return;

    // Update tenant info
    document.getElementById('tenant-detail-name').textContent = tenant.tenantName || 'N/A';
    document.getElementById('tenant-detail-room').textContent = tenant.roomNumber || 'N/A';
    document.getElementById('tenant-detail-rent').textContent = `₹${formatIndianNumber(tenant.monthlyRent || 0)}`;
    document.getElementById('tenant-detail-due').textContent = `₹${formatIndianNumber(Math.round(calculatePreviousDue(tenant)))}`;
    document.getElementById('tenant-detail-rate').textContent = tenant.electricityRate || 10;

    // Update payment history
    const paymentTbody = document.getElementById('payment-history-body');
    paymentTbody.innerHTML = '';
    
    if (tenant.paymentHistory && tenant.paymentHistory.length > 0) {
        tenant.paymentHistory.forEach((payment, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${formatDate(payment.date)}</td>
                <td>₹${formatIndianNumber(Math.round(payment.amount || 0))}</td>
                <td>${payment.type || 'Rent'}</td>
                <td>${payment.notes || ''}</td>
                <td class="actions">
                    <button class="action-btn edit-payment" data-tenant-id="${tenant.id}" data-index="${index}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete delete-payment" data-tenant-id="${tenant.id}" data-index="${index}">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            paymentTbody.appendChild(row);
        });
    } else {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="5" class="text-center">No payment history found</td>';
        paymentTbody.appendChild(row);
    }

    // Update electricity readings
    const electricityTbody = document.getElementById('electricity-readings-body');
    electricityTbody.innerHTML = '';
    
    if (tenant.electricityReadings && tenant.electricityReadings.length > 1) {
        for (let i = 1; i < tenant.electricityReadings.length; i++) {
            const current = tenant.electricityReadings[i];
            const prev = tenant.electricityReadings[i - 1];
            const units = current.reading - prev.reading;
            const amount = units * (tenant.electricityRate || 10);
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${formatDate(current.date)}</td>
                <td>${current.reading}</td>
                <td>${units}</td>
                <td>₹${formatIndianNumber(Math.round(amount))}</td>
            `;
            electricityTbody.appendChild(row);
        }
    } else {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="4" class="text-center">No electricity readings available</td>';
        electricityTbody.appendChild(row);
    }

    // Show the modal
    const modal = document.getElementById('tenant-details-modal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Close tenant details modal
function closeTenantDetails() {
    const modal = document.getElementById('tenant-details-modal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

// Add event listeners for tenant details modal
function setupTenantDetailsModal() {
    // Close modal when clicking the close button
    const closeButton = document.getElementById('close-tenant-details');
    if (closeButton) {
        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            closeTenantDetails();
        });
    }

    // Close modal when clicking outside the modal content
    const modal = document.getElementById('tenant-details-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeTenantDetails();
            }
        });
    }

    // Tab switching in the modal
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons and contents
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked button
            button.classList.add('active');
            // Update ARIA
            tabButtons.forEach(btn => btn.setAttribute('aria-selected', btn === button ? 'true' : 'false'));
            
            // Show corresponding content
            const tabId = button.getAttribute('data-tab');
            document.getElementById(`${tabId}-tab`).classList.add('active');
        });
    });
}

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    initializeNavigation();
    initializePlotTabs();
    setupTenantDetailsModal();
    initializeTheme();
    addThemeToggle();
    addTenantStatusFilter();
    initializeSidebar();
    setupServiceWorkerUpdatePrompt();

    // Set tenants tab as active by default
    const tenantsTab = document.querySelector('.nav-btn[data-section="tenants"]');
    if (tenantsTab) {
        tenantsTab.click();
    }

    // Migrate tenant IDs first
    await migrateTenantIds();

    // Check Firebase connection first
    try {
        const isConnected = await checkFirebaseConnection();
        if (isConnected) {
            console.log('Firebase is connected');
            const hasPermissions = await checkFirebaseRules();
            if (hasPermissions) {
                console.log('Firebase is ready to sync data');
                // Load data from Firebase first
                await loadTenantsFromFirebase();
                // Set up periodic data refresh
                setupPeriodicRefresh();
            } else {
                console.error('Firebase permissions not properly configured');
                // Fall back to localStorage
                loadTenants();
            }
        } else {
            console.error('Firebase connection failed. Loading from localStorage.');
            // Fall back to localStorage
            loadTenants();
        }
    } catch (error) {
        console.error('Error during initialization:', error);
        // Fall back to localStorage
        loadTenants();
    }

    // Set up event listeners after data is loaded
    setupEventListeners();
    updateDashboardStats();
    
    // Process any remaining batch operations before page unload
    window.addEventListener('beforeunload', async (event) => {
        if (CacheManager.batchQueue.length > 0) {
            console.log('Processing remaining batch operations before unload...');
            try {
                await CacheManager.processBatch();
            } catch (error) {
                console.error('Failed to process batch operations before unload:', error);
            }
        }
    });
});

// Set up periodic data refresh with intelligent caching
function setupPeriodicRefresh() {
    // Refresh data every 30 minutes instead of 15 (reduced frequency)
    setInterval(async () => {
        try {
            const currentPlot = getCurrentPlot();
            const cachedData = CacheManager.getCachedData(currentPlot);
            
            // Only refresh if cache is expired or doesn't exist
            if (!cachedData) {
                console.log('Cache expired, refreshing data...');
                await loadTenantsFromFirebase();
                console.log('Data refreshed successfully');
            } else {
                console.log('Using cached data, skipping refresh');
            }
        } catch (error) {
            console.error('Data refresh failed:', error);
        }
    }, 30 * 60 * 1000); // 30 minutes instead of 15
}

// Load tenants from Firestore with caching
async function loadTenantsFromFirebase() {
    const currentPlot = getCurrentPlot();
    
    // Check cache first
    const cachedData = CacheManager.getCachedData(currentPlot);
    if (cachedData) {
        console.log('Using cached data for plot:', currentPlot);
        displayTenants(cachedData);
        updateTenantSelect(cachedData);
        updateDashboardStats();
        return cachedData;
    }
    
    try {
        console.log('Fetching data from Firebase for plot:', currentPlot);
        const snapshot = await db.collection('tenants')
            .where('plotName', '==', currentPlot)
            .get();
            
        const tenants = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // Ensure ID is a number
            data.id = Number(data.id);
            tenants.push(data);
        });
        
        // Cache the data
        CacheManager.setCachedData(currentPlot, tenants);
        
        // Always update localStorage with Firebase data
        const plotKey = getPlotStorageKey(currentPlot);
        localStorage.setItem(plotKey, JSON.stringify(tenants));
        
        // Apply search filter if exists
        const filteredTenants = currentSearchTerm ? tenants.filter(tenant => 
            tenant.tenantName.toLowerCase().includes(currentSearchTerm) ||
            tenant.roomNumber.toLowerCase().includes(currentSearchTerm)
        ) : tenants;
        
        displayTenants(filteredTenants);
        updateTenantSelect(tenants);
        updateDashboardStats();
        
        return tenants;
    } catch (error) {
        console.error('Error loading from Firestore:', error);
        throw error; // Propagate error for proper fallback
    }
}

// Load tenants from localStorage
function loadTenants() {
    const currentPlot = getCurrentPlot();
    console.log('Loading tenants for plot:', currentPlot);
    const plotKey = getPlotStorageKey(currentPlot);
    
    // Initialize the plot data if it doesn't exist
    if (!localStorage.getItem(plotKey)) {
        console.log('Initializing new plot data for:', currentPlot);
        localStorage.setItem(plotKey, JSON.stringify([]));
    }
    
    const tenants = JSON.parse(localStorage.getItem(plotKey) || '[]');
    // Ensure all tenant IDs are numbers
    tenants.forEach(tenant => {
        tenant.id = Number(tenant.id);
    });
    console.log('Loaded tenants:', tenants);
    
    // Apply search filter if exists
    const filteredTenants = currentSearchTerm ? tenants.filter(tenant => 
        tenant.tenantName.toLowerCase().includes(currentSearchTerm) ||
        tenant.roomNumber.toLowerCase().includes(currentSearchTerm)
    ) : tenants;
    
    // Display using central renderer (applies status filter + sorting)
    displayTenants(filteredTenants);
    
    // Update tenant select dropdown
    updateTenantSelect(tenants);
    
    // Update dashboard stats
    updateDashboardStats();
}

// Initialize navigation
function initializeNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.section');
    
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetSection = button.getAttribute('data-section');
            
            // Hide all sections
            sections.forEach(section => {
                section.style.display = 'none';
            });
            
            // Show target section
            document.getElementById(targetSection).style.display = 'block';
            
            // Update active state
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Load section-specific data
            if (targetSection === 'payment-history') {
                loadPaymentHistory();
            } else if (targetSection === 'tenants') {
                loadTenants();
            } else if (targetSection === 'monthly-history') {
                loadMonthlyHistory();
            }
            
            // Close sidebar on mobile
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
                const sidebar = document.querySelector('.sidebar');
                const contentArea = document.querySelector('.content-area');
                const sidebarToggle = document.getElementById('sidebar-toggle');
                const icon = sidebarToggle.querySelector('i');
                
                sidebar.classList.remove('active');
                contentArea.classList.remove('sidebar-active');
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        });
    });
}

// Initialize plot tabs
function initializePlotTabs() {
    const plotTabs = document.querySelectorAll('.plot-tab');
    plotTabs.forEach(tab => {
        tab.addEventListener('click', async () => {
            // Remove active class from all tabs
            document.querySelectorAll('.plot-tab').forEach(t => t.classList.remove('active'));
            // Add active class to clicked tab
            tab.classList.add('active');
            
            // Get the selected plot
            const selectedPlot = tab.getAttribute('data-plot');
            console.log('Switching to plot:', selectedPlot);
            
            // Load data for the selected plot
            try {
                // Try to load from Firebase first
                await loadTenantsFromFirebase();
            } catch (error) {
                console.error('Error loading from Firebase:', error);
                // Fall back to localStorage
                loadTenants();
            }
            
            // Update dashboard stats
            updateDashboardStats();
            
            // Refresh payment history if it's currently visible
            if (document.getElementById('payment-history').style.display === 'block') {
                loadPaymentHistory();
            }
            
            // Only show tenants if the tenants section is active
            const tenantsSection = document.getElementById('tenants');
            const isTenantsSectionActive = tenantsSection && tenantsSection.style.display === 'block';
            if (isTenantsSectionActive) {
                loadTenants();
            }
        });
    });

    // Keyboard navigation for ARIA tabs
    const tabList = document.querySelector('.plot-tabs[role="tablist"]');
    if (tabList) {
        tabList.addEventListener('keydown', (e) => {
            const tabs = Array.from(tabList.querySelectorAll('[role="tab"]'));
            const current = document.activeElement;
            const idx = tabs.indexOf(current);
            if (idx === -1) return;
            let nextIdx = idx;
            if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
            if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
            if (nextIdx !== idx) {
                e.preventDefault();
                tabs[idx].setAttribute('tabindex', '-1');
                tabs[idx].setAttribute('aria-selected', 'false');
                tabs[nextIdx].setAttribute('tabindex', '0');
                tabs[nextIdx].setAttribute('aria-selected', 'true');
                tabs[nextIdx].focus();
                tabs[nextIdx].click();
            }
        });
    }
}

// Setup event listeners for forms and buttons
function setupEventListeners() {
    // Tenant form submission
    const tenantForm = document.getElementById('tenant-form');
    tenantForm.addEventListener('submit', handleTenantFormSubmit);

    // Search functionality
    const searchInput = document.getElementById('search-tenant');
    searchInput.addEventListener('input', handleSearch);

    // Payment history filters
    const paymentTenantSelect = document.getElementById('payment-tenant-select');
    const paymentMonth = document.getElementById('payment-month');
    const allMonthsCheckbox = document.getElementById('all-months');
    paymentTenantSelect.addEventListener('change', loadPaymentHistory);
    paymentMonth.addEventListener('change', loadPaymentHistory);
    allMonthsCheckbox.addEventListener('change', loadPaymentHistory);

    // Data management
    const importDataInput = document.getElementById('import-data');
    importDataInput.addEventListener('change', handleDataImport);
    
    const exportDataBtn = document.getElementById('export-data');
    exportDataBtn.addEventListener('click', handleDataExport);

    // Sync data
    const syncDataBtn = document.getElementById('sync-data');
    syncDataBtn.addEventListener('click', handleDataSync);

    // Add event listener for window unload to ensure data is saved
    window.addEventListener('beforeunload', () => {
        saveAllData();
    });

    // Delegated expand/collapse at document level so it survives tab switches
    document.addEventListener('click', (e) => {
        // Only act when Tenants section is visible
        const tenantsSection = document.getElementById('tenants');
        if (!tenantsSection || tenantsSection.style.display !== 'block') return;

        // Toggle button inside header
        const toggleBtn = e.target.closest('.toggle-card');
        if (toggleBtn && tenantsSection.contains(toggleBtn)) {
            e.stopPropagation();
            const card = toggleBtn.closest('.tenant-card');
            if (card) card.classList.toggle('expanded');
            return;
        }

        // Click anywhere on card except on actionable controls
        const card = e.target.closest('.tenant-card');
        if (!card || !tenantsSection.contains(card)) return;
        if (e.target.closest('.tenant-actions') || e.target.closest('button') || e.target.closest('a') || e.target.closest('.open-details')) return;
        card.classList.toggle('expanded');
    });
}

// Helper to get YYYY-MM string from Date
function formatYearMonth(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}`;
}

// Get rent applicable for a specific month based on rentHistory
function getRentForMonth(tenant, year, month) {
    if (!tenant.rentHistory || tenant.rentHistory.length === 0) {
        return tenant.monthlyRent || 0;
    }
    // Ensure history sorted by date ascending
    const history = [...tenant.rentHistory].sort((a,b)=> new Date(a.date)-new Date(b.date));
    const target = new Date(year, month, 1);
    let applicable = history[0].amount;
    history.forEach(entry => {
        if (new Date(entry.date) <= target) {
            applicable = entry.amount;
        }
    });
    return applicable;
}

// Constants
const PLOTS = ['home', 'baba', 'shop', 'others'];
const DEFAULT_ELECTRICITY_RATE = 10;

// ====================== Monthly History Cache ======================
const MONTHLY_CACHE_KEY = 'monthlyDataCache';
const MONTHS_PER_PAGE = 12;

function invalidateMonthlyCache() {
    sessionStorage.removeItem(MONTHLY_CACHE_KEY);
}

function getCachedMonthlyData() {
    const cache = sessionStorage.getItem(MONTHLY_CACHE_KEY);
    return cache ? JSON.parse(cache) : null;
}

function setCachedMonthlyData(data) {
    sessionStorage.setItem(MONTHLY_CACHE_KEY, JSON.stringify(data));
}
// ==================================================================
// ----------------- Monthly History Pagination --------------------
let currentMonthPage = 0;

function renderMonthlyBreakdown(monthlyData, page = 0) {
    currentMonthPage = page;
    const totalPages = Math.ceil(monthlyData.length / MONTHS_PER_PAGE);
    const startIdx = page * MONTHS_PER_PAGE;
    const endIdx = startIdx + MONTHS_PER_PAGE;
    const pageData = monthlyData.slice(startIdx, endIdx);

    const breakdownContainer = document.getElementById('monthly-breakdown');
    if (!breakdownContainer) return;

    const breakdownHtml = pageData.map(data => {
        const [year, month] = data.month.split('-');
        const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
        return `
            <div class="monthly-item">
                <div class="month">${monthName} ${year}</div>
                <div class="amount">Rent: ₹${formatIndianNumber(Math.round(data.totalRent))}</div>
                <div class="amount">Bills: ₹${formatIndianNumber(Math.round(data.totalBills))}</div>
                <div class="amount ${data.totalPayments >= (data.totalRent + data.totalBills) ? 'positive' : 'negative'}">
                    Payments: ₹${formatIndianNumber(Math.round(data.totalPayments))}
                </div>
            </div>`;
    }).join('');

    breakdownContainer.innerHTML = breakdownHtml || '<div class="no-data">No history available</div>';

    // Render pagination controls
    let pager = document.getElementById('monthly-pagination');
    if (!pager) {
        pager = document.createElement('div');
        pager.id = 'monthly-pagination';
        pager.className = 'pagination-controls';
        breakdownContainer.after(pager);
    }

    if (totalPages <= 1) {
        pager.innerHTML = '';
        return;
    }

    pager.innerHTML = `
        <button id="prev-month-page" ${page === 0 ? 'disabled' : ''}>Prev</button>
        <span class="page-info">Page ${page + 1} / ${totalPages}</span>
        <button id="next-month-page" ${page >= totalPages - 1 ? 'disabled' : ''}>Next</button>`;

    document.getElementById('prev-month-page')?.addEventListener('click', () => {
        if (currentMonthPage > 0) renderMonthlyBreakdown(monthlyData, currentMonthPage - 1);
    });
    document.getElementById('next-month-page')?.addEventListener('click', () => {
        if (currentMonthPage < totalPages - 1) renderMonthlyBreakdown(monthlyData, currentMonthPage + 1);
    });
}
// ==================================================================

// Utility Functions
function getCurrentPlot() {
    const activeTab = document.querySelector('.plot-tab.active');
    return activeTab ? activeTab.getAttribute('data-plot') : 'home';
}

function getPlotStorageKey(plot) {
    return `tenants_${plot}`;
}

function getTenants(plot = getCurrentPlot()) {
    const plotKey = getPlotStorageKey(plot);
    return JSON.parse(localStorage.getItem(plotKey) || '[]');
}

function findTenant(tenantId, plot = getCurrentPlot()) {
    const tenants = getTenants(plot);
    return tenants.find(t => t.id === tenantId);
}

// Calculation Functions
function calculateMonthsDifference(startDate, endDate = new Date()) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    let days = end.getDate() - start.getDate();

    if (days < 0) {
        months--;
    }

    let totalMonths = years * 12 + months;

    // Return number of full cycles, ensuring at least one month is counted if tenancy has started.
    return Math.max(0, totalMonths) + 1;
}

// Calculate total electricity bill for a tenant
function calculateTotalElectricityBill(tenant) {
    if (!tenant.electricityReadings || tenant.electricityReadings.length < 2) return 0;
    
    const startReading = tenant.electricityReadings[0];
    const lastReading = tenant.electricityReadings[tenant.electricityReadings.length - 1];
    const totalUnits = lastReading.reading - startReading.reading;
    
    return totalUnits * (tenant.electricityRate || DEFAULT_ELECTRICITY_RATE);
}

// Calculate current month's electricity bill
function calculateCurrentMonthBill(tenant) {
    if (!tenant.electricityReadings || tenant.electricityReadings.length < 2) return 0;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Filter readings that belong to the current calendar month
    const readingsThisMonth = tenant.electricityReadings.filter(r => {
        const d = new Date(r.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    // If no reading has been recorded this month yet, the bill resets to 0
    if (readingsThisMonth.length === 0) return 0;

    // Locate the first reading of this month in the full readings array
    const firstIndexThisMonth = tenant.electricityReadings.findIndex(r => {
        const d = new Date(r.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    // Reading immediately before the first reading of this month (may be in previous month)
    const prevReading = firstIndexThisMonth > 0
        ? tenant.electricityReadings[firstIndexThisMonth - 1]
        : readingsThisMonth[0];

    // Latest reading in the current month
    const lastReadingThisMonth = readingsThisMonth[readingsThisMonth.length - 1];

    const units = lastReadingThisMonth.reading - prevReading.reading;
    return Math.max(0, units) * (tenant.electricityRate || DEFAULT_ELECTRICITY_RATE);
}

// Calculate total electricity due (including unpaid bills)
function calculateElectricityDue(tenant) {
    const totalBill = calculateTotalElectricityBill(tenant);
    const totalPaid = calculateTotalPayments(tenant);
    return Math.max(0, totalBill - totalPaid);
}

function calculateTotalPayments(tenant) {
    return tenant.paymentHistory ? tenant.paymentHistory.reduce((sum, payment) => {
        return sum + payment.amount;
    }, 0) : 0;
}

function calculateRentDue(tenant) {
    const effectiveEnd = tenant.endDate ? new Date(tenant.endDate) : new Date();
    const start = new Date(tenant.startDate);
    let current = new Date(start.getFullYear(), start.getMonth(), 1);
    let totalRentDue = 0;
    while (current <= effectiveEnd) {
        const rent = getRentForMonth(tenant, current.getFullYear(), current.getMonth());
        totalRentDue += rent;
        current.setMonth(current.getMonth()+1);
    }
    const totalPaid = calculateTotalPayments(tenant);
    const currentMonthBill = calculateCurrentMonthBill(tenant);
    return totalRentDue - totalPaid + tenant.previousDue + currentMonthBill;
}


// Data Management Functions
async function saveTenant(tenant) {
    // Initialize rentHistory if missing
    if (!tenant.rentHistory || tenant.rentHistory.length === 0) {
        tenant.rentHistory = [{ amount: tenant.monthlyRent, date: tenant.startDate }];
    } else {
        // Check if latest entry differs from current rent; if so, append change with today
        const last = tenant.rentHistory[tenant.rentHistory.length - 1];
        if (last.amount !== tenant.monthlyRent) {
            tenant.rentHistory.push({ amount: tenant.monthlyRent, date: new Date().toISOString().split('T')[0] });
        }
    }
    const plotKey = getPlotStorageKey(tenant.plotName);
    const tenants = getTenants(tenant.plotName);
    const index = tenants.findIndex(t => t.id === tenant.id);
    
    if (index !== -1) {
        tenants[index] = tenant;
    } else {
        tenants.push(tenant);
    }
    
    // Update localStorage immediately
    localStorage.setItem(plotKey, JSON.stringify(tenants));
    // Invalidate monthly history cache since data changed
    invalidateMonthlyCache();
    // If Monthly History tab is active, reload it to reflect changes
    const monthlySection = document.getElementById('monthly-history');
    if (monthlySection && monthlySection.style.display === 'block') {
        loadMonthlyHistory();
    }
    
    // Update cache
    CacheManager.setCachedData(tenant.plotName, tenants);
    
    // Add to batch queue instead of immediate Firebase call
    CacheManager.addToBatch({
        type: 'set',
        path: `tenants/${tenant.id}`,
        data: tenant
    });
    
    // Process batch if queue is getting large or after a delay
    if (CacheManager.batchQueue.length >= 10) {
        await CacheManager.processBatch();
    } else {
        // Process batch after 2 seconds if no more operations
        setTimeout(() => {
            CacheManager.processBatch();
        }, 2000);
    }
}

async function handleDataImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const data = JSON.parse(text);

        // Validate the imported data structure
        if (!Array.isArray(data)) {
            throw new Error('Invalid data format: Expected an array of tenants');
        }

        // Validate each tenant object
        for (const tenant of data) {
            if (!tenant.id || !tenant.tenantName || !tenant.roomNumber || !tenant.startDate) {
                throw new Error('Invalid tenant data: Missing required fields');
            }
        }

        // Get current plot
        const currentPlot = getCurrentPlot();
        const plotKey = getPlotStorageKey(currentPlot);

        // Save to localStorage
        localStorage.setItem(plotKey, JSON.stringify(data));
        
        // Update cache
        CacheManager.setCachedData(currentPlot, data);

        // Use batch operations for Firebase import
        try {
            // Clear existing batch queue
            CacheManager.batchQueue = [];
            
            // Add all tenants to batch queue
            for (const tenant of data) {
                CacheManager.addToBatch({
                    type: 'set',
                    path: `tenants/${tenant.id}`,
                    data: tenant
                });
            }
            
            // Process the batch
            await CacheManager.processBatch();
            console.log(`Imported ${data.length} tenants using batch operations`);
        } catch (error) {
            console.error('Firebase import failed:', error);
            alert('Warning: Data was imported locally but failed to sync with Firebase.');
        }

        // Refresh the display
        loadTenants();
        updateDashboardStats();
        alert('Data imported successfully!');
    } catch (error) {
        console.error('Import error:', error);
        alert('Error importing data: ' + error.message);
    }

    // Reset the file input
    event.target.value = '';
}

// Display Functions
function createTenantCard(tenant) {
    const monthsSinceStart = calculateMonthsDifference(tenant.startDate);
    const currentMonthBill = calculateCurrentMonthBill(tenant);
    const totalElectricityBill = calculateTotalElectricityBill(tenant);
    const previousDue = calculatePreviousDue(tenant);
    const lastPayment = tenant.paymentHistory?.[tenant.paymentHistory.length - 1] || { amount: 0, date: 'N/A' };
    const lastReading = tenant.electricityReadings?.[tenant.electricityReadings.length - 1] || { reading: 0, date: 'N/A' };
    const previousReading = tenant.electricityReadings?.[tenant.electricityReadings.length - 2] || { reading: 0, date: 'N/A' };
    const startReading = tenant.electricityReadings?.[0] || { reading: 0, date: 'N/A' };
    const currentMonthDue = tenant.monthlyRent + currentMonthBill;
    const isActive = !tenant.endDate;

    return `
        <div class="tenant-card ${isActive ? 'active-tenant' : 'past-tenant'}">
            <h3 style="cursor: pointer;">
                <i class="fas fa-user"></i> ${tenant.tenantName}
                <span class="room-number">Room ${tenant.roomNumber}</span>
                <span class="tenant-status ${isActive ? 'active' : 'past'}">
                    ${isActive ? 'Active' : 'Past'}
                </span>
                <button class="toggle-card" title="Expand/Collapse" aria-label="Expand or collapse tenant info">
                    <i class="fas fa-chevron-down"></i>
                </button>
                <button class="open-details" data-tenant-id="${tenant.id}" title="Open details" aria-label="Open tenant details">
                    <i class="fas fa-external-link-alt"></i>
                </button>
            </h3>
            <div class="tenant-info">
                <div class="info-section" data-section="basic-info">
                    <h4><i class="fas fa-info-circle"></i> Basic Information</h4>
                    <p><strong>Start Date:</strong> ${formatDate(tenant.startDate)}</p>
                    ${tenant.endDate ? `<p><strong>End Date:</strong> ${formatDate(tenant.endDate)}</p>` : ''}
                    <p><strong>Months Since Start:</strong> ${monthsSinceStart}</p>
                    <p><strong>Monthly Rent:</strong> ₹${formatIndianNumber(tenant.monthlyRent)}</p>
                    <p><strong>Advance Paid:</strong> ₹${tenant.advancePaid}</p>
                </div>
                
                <div class="info-section">
                    <h4><i class="fas fa-money-bill-wave"></i> Payment Information</h4>
                    <p><strong>Current Month:</strong> ₹${formatIndianNumber(Math.round(currentMonthDue))}</p>
                    <p><strong>Total Due:</strong> <span class="total-due-amount">₹${formatIndianNumber(Math.round(previousDue || 0))}</span></p>
                    <p><strong>Last Payment:</strong> ₹${Math.round(lastPayment.amount)} (${lastPayment.date === 'N/A' ? 'N/A' : formatDate(lastPayment.date)})</p>
                </div>
                
                <div class="info-section" data-section="electricity">
                    <h4><i class="fas fa-bolt"></i> Electricity Information</h4>
                    <p>
                        <strong>Start Reading:</strong> 
                        ${startReading.reading} (${startReading.date === 'N/A' ? 'N/A' : formatDate(startReading.date)})
                        <button onclick="editElectricityReading(${tenant.id}, 0)" class="inline-edit-btn" title="Edit Start Reading">
                            <i class="fas fa-edit"></i>
                        </button>
                    </p>
                    <p>
                        <strong>Previous Reading:</strong> 
                        ${previousReading.reading} (${previousReading.date === 'N/A' ? 'N/A' : formatDate(previousReading.date)})
                        ${tenant.electricityReadings.length > 1 ? `
                            <button onclick="editElectricityReading(${tenant.id}, ${tenant.electricityReadings.length - 2})" class="inline-edit-btn" title="Edit Previous Reading">
                                <i class="fas fa-edit"></i>
                            </button>
                        ` : ''}
                    </p>
                    <p>
                        <strong>Latest Reading:</strong> 
                        ${lastReading.reading} (${lastReading.date === 'N/A' ? 'N/A' : formatDate(lastReading.date)})
                        ${tenant.electricityReadings.length > 0 ? `
                            <button onclick="editElectricityReading(${tenant.id}, ${tenant.electricityReadings.length - 1})" class="inline-edit-btn" title="Edit Latest Reading">
                                <i class="fas fa-edit"></i>
                            </button>
                        ` : ''}
                    </p>
                    <p><strong>Current Month Bill:</strong> ₹${formatIndianNumber(Math.round(currentMonthBill))}</p>
                    <p><strong>Total Electricity Bill:</strong> ₹${formatIndianNumber(Math.round(totalElectricityBill))}</p>
                </div>
            </div>
            <div class="tenant-actions">
                <button onclick="editTenant(${tenant.id})" class="edit-btn">
                    <i class="fas fa-edit"></i> Edit
                </button>
                ${isActive ? `
                    <button onclick="addElectricityReading(${tenant.id})" class="submit-btn">
                        <i class="fas fa-bolt"></i> Add Reading
                    </button>
                    <button onclick="recordPayment(${tenant.id})" class="submit-btn">
                        <i class="fas fa-money-bill-wave"></i> Record Payment
                    </button>
                    <button onclick="openVacateForm(${tenant.id})" class="submit-btn">
                        <i class="fas fa-sign-out-alt"></i> Vacate
                    </button>
                ` : ''}
                <button onclick="deleteTenant(${tenant.id})" class="delete-btn">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        </div>
    `;
}

// ... (rest of the code remains the same)
// Update dashboard statistics
function updateDashboardStats() {
    const currentPlot = getCurrentPlot();
    const plotKey = getPlotStorageKey(currentPlot);
    const tenants = JSON.parse(localStorage.getItem(plotKey) || '[]');
    
    // Include all tenants for calculations
    const allTenants = tenants;
    
    // Filter active tenants (no end date or end date is in the future) for tenant count and due
    const activeTenants = allTenants.filter(tenant => {
        if (!tenant.endDate) return true;
        const endDate = new Date(tenant.endDate);
        return endDate >= new Date();
    });

    // Calculate statistics
    const totalTenants = activeTenants.length;
    const totalDue = activeTenants.reduce((sum, tenant) => sum + calculatePreviousDue(tenant), 0);
    
    // Calculate total monthly rent and bill using all tenants
    const totalMonthlyRent = allTenants.reduce((sum, tenant) => sum + (tenant.monthlyRent || 0), 0);
    const totalMonthlyBill = allTenants.reduce((sum, tenant) => sum + calculateCurrentMonthBill(tenant), 0);

    document.getElementById('total-tenants').textContent = formatIndianNumber(totalTenants);
    document.getElementById('total-rent').textContent = formatINR(totalDue);
    document.getElementById('total-monthly-rent').textContent = formatINR(totalMonthlyRent);
    document.getElementById('total-monthly-bill').textContent = formatINR(totalMonthlyBill);
    
    // Add current month payments calculation
    calculateCurrentMonthPayments();

    // Update combined stats
    updateCombinedStats();
}

// Format date to dd/mm/yy
function formatDate(dateString) {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
}

// Handle tenant form submission
async function handleTenantFormSubmit(e) {
    e.preventDefault();
    
    try {
        const currentPlot = getCurrentPlot();
        const tenant = {
            id: Date.now(),
            plotName: currentPlot,
            roomNumber: document.getElementById('room-number').value,
            tenantName: document.getElementById('tenant-name').value,
            startDate: document.getElementById('start-date').value,
            advancePaid: parseFloat(document.getElementById('advance-paid').value) || 0,
            monthlyRent: parseFloat(document.getElementById('monthly-rent').value) || 0,
            startingDue: parseFloat(document.getElementById('starting-due').value) || 0,
            electricityRate: parseFloat(document.getElementById('electricity-rate').value) || 10,
            electricityReadings: [{
                reading: parseFloat(document.getElementById('starting-electricity').value) || 0,
                date: new Date().toISOString().split('T')[0]
            }],
            paymentHistory: [],
            previousDue: 0,
            lastElectricityDue: 0,
            isActive: true
        };

        // Validate required fields
        if (!tenant.roomNumber || !tenant.tenantName || !tenant.startDate) {
            throw new Error('Please fill in all required fields');
        }

        // Save tenant data
        await saveTenant(tenant);
        
        // Reset form and update display
        e.target.reset();
        await loadTenants();
        updateDashboardStats();
        
        alert('Tenant added successfully!');
    } catch (error) {
        console.error('Error adding tenant:', error);
        alert(error.message || 'Error adding tenant. Please try again.');
    }
}

// Update the display function with improved tenant information
function displayTenants(tenants) {
    const tenantsList = document.getElementById('tenants-list');
    tenantsList.innerHTML = '';

    // Apply status filter preference
    let list = tenants;
    if (tenantStatusFilter === 'active') {
        list = list.filter(t => !t.endDate);
    } else if (tenantStatusFilter === 'past') {
        list = list.filter(t => !!t.endDate);
    }

    // Sort by room number (numeric when possible, else string locale compare)
    list.sort((a, b) => {
        const ax = parseFloat(a.roomNumber);
        const bx = parseFloat(b.roomNumber);
        const aIsNum = !isNaN(ax);
        const bIsNum = !isNaN(bx);
        if (aIsNum && bIsNum) return ax - bx;
        if (aIsNum) return -1;
        if (bIsNum) return 1;
        return String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, { numeric: true, sensitivity: 'base' });
    });

    if (list.length === 0) {
        tenantsList.innerHTML = '<p class="no-tenants">No tenants found.</p>';
        return;
    }

    list.forEach(tenant => {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = createTenantCard(tenant);
        const card = wrapper.firstElementChild;

        // Open details modal on details button
        const detailsBtn = card.querySelector('.open-details');
        if (detailsBtn) {
            detailsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = detailsBtn.getAttribute('data-tenant-id');
                showTenantDetails(Number(id));
            });
        }

        tenantsList.appendChild(card);
    });
}

// Update tenant select dropdown
function updateTenantSelect(tenants) {
    const paymentTenantSelect = document.getElementById('payment-tenant-select');
    
    if (paymentTenantSelect) {
        const options = '<option value="">All Tenants</option>' + 
            tenants.map(tenant => 
                `<option value="${tenant.id}">${tenant.tenantName} - Room ${tenant.roomNumber}</option>`
            ).join('');
        
        paymentTenantSelect.innerHTML = options;
    }
}

// Handle search functionality with debouncing
const debouncedSearch = debounce((searchTerm) => {
    const currentPlot = getCurrentPlot();
    const plotKey = getPlotStorageKey(currentPlot);
    const tenants = JSON.parse(localStorage.getItem(plotKey) || '[]');
    
    const filteredTenants = tenants.filter(tenant => 
        tenant.tenantName.toLowerCase().includes(searchTerm) ||
        tenant.roomNumber.toLowerCase().includes(searchTerm)
    );
    
    displayTenants(filteredTenants);
}, 300);

function handleSearch(e) {
    currentSearchTerm = e.target.value.toLowerCase();
    debouncedSearch(currentSearchTerm);
}

// Calculate previous due based on total months minus 1 multiplied by rent, plus total electricity bill due, minus total payments made
function calculatePreviousDue(tenant) {
    // If tenant is vacated (has an endDate) we should not include rent after that date
    const effectiveEnd = tenant.endDate ? new Date(tenant.endDate) : new Date();
    // Recalculate total rent using history, based on rent cycles from start date
    let totalRentDue = 0;
    const start = new Date(tenant.startDate);
    const end = effectiveEnd;

    let rentDueDate = new Date(start);

    while (rentDueDate <= end) {
        totalRentDue += getRentForMonth(tenant, rentDueDate.getFullYear(), rentDueDate.getMonth());
        rentDueDate.setMonth(rentDueDate.getMonth() + 1);
    }
    const totalElectricityDue = calculateTotalElectricityBill(tenant);
    const totalPaymentsMade = calculateTotalPayments(tenant);
    const startingDue = tenant.startingDue || 0;

    return totalRentDue + totalElectricityDue - totalPaymentsMade + startingDue;
}

// Update previous due when recording payment
function updatePreviousDue(tenant, paymentAmount) {
    tenant.previousDue = calculatePreviousDue(tenant);
    return tenant.previousDue;
}

// Update previous due when adding electricity reading
function updatePreviousDueWithNewReading(tenant) {
    tenant.previousDue = calculatePreviousDue(tenant);
    return tenant.previousDue;
}

// Record payment
function recordPayment(tenantId) {
    const currentPlot = getCurrentPlot();
    const plotKey = getPlotStorageKey(currentPlot);
    const tenants = JSON.parse(localStorage.getItem(plotKey) || '[]');
    const tenant = tenants.find(t => t.id === Number(tenantId));

    if (!tenant) {
        alert('Tenant not found');
        return;
    }

    // Remove any existing payment form
    const existingForm = document.querySelector('.payment-form');
    if (existingForm) {
        existingForm.remove();
    }

    const form = document.createElement('form');
    form.className = 'payment-form';
    form.innerHTML = `
        <h3>Record Payment</h3>
        <div class="form-group">
            <label for="paymentAmount">Payment Amount</label>
            <input type="number" id="paymentAmount" required min="0" step="0.01">
        </div>
        <div class="form-group">
            <label for="paymentDate">Payment Date</label>
            <input type="date" id="paymentDate" required value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-actions">
            <button type="submit">Record Payment</button>
            <button type="button" onclick="closePaymentForm()">Cancel</button>
        </div>
    `;

    document.body.appendChild(form);

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const amount = parseFloat(document.getElementById('paymentAmount').value);
        const date = document.getElementById('paymentDate').value;

        // Add payment to history
        if (!tenant.paymentHistory) {
            tenant.paymentHistory = [];
        }
        tenant.paymentHistory.push({
            amount: amount,
            date: date
        });

        // Update previous due
        const currentMonthBill = calculateCurrentMonthBill(tenant);
        tenant.previousDue = Math.max(0, tenant.monthlyRent + currentMonthBill - amount);

        // Save tenant data
        await saveTenant(tenant);
        
        // Close form and refresh display
        closePaymentForm();
        loadTenants();
        updateDashboardStats();
    });
}

function closePaymentForm() {
    const form = document.querySelector('.payment-form');
    if (form) {
        form.remove();
    }
}

// Delete tenant
async function deleteTenant(tenantId) {
    if (!confirm('Are you sure you want to delete this tenant?')) return;

    const currentPlot = getCurrentPlot();
    const plotKey = getPlotStorageKey(currentPlot);
    const tenants = JSON.parse(localStorage.getItem(plotKey) || '[]');
    const updatedTenants = tenants.filter(t => t.id !== Number(tenantId));

    // Update localStorage immediately
    localStorage.setItem(plotKey, JSON.stringify(updatedTenants));
    // Invalidate monthly history cache since data changed
    invalidateMonthlyCache();
    
    // Update cache
    CacheManager.setCachedData(currentPlot, updatedTenants);

    // If Monthly History tab is active, reload it to reflect tenant deletion
    const monthlySection = document.getElementById('monthly-history');
    if (monthlySection && monthlySection.style.display === 'block') {
        loadMonthlyHistory();
    }

    // Add delete operation to batch queue
    CacheManager.addToBatch({
        type: 'delete',
        path: `tenants/${tenantId}`,
        data: null
    });
    
    // Process batch immediately for delete operations
    await CacheManager.processBatch();

    loadTenants();
    updateDashboardStats();
}

// Load payment history
function loadPaymentHistory() {
    const currentPlot = getCurrentPlot();
    const plotKey = getPlotStorageKey(currentPlot);
    const tenants = JSON.parse(localStorage.getItem(plotKey) || '[]');
    const selectedTenant = document.getElementById('payment-tenant-select').value;
    
    // Set current month by default if not already set
    const monthInput = document.getElementById('payment-month');
    if (!monthInput.value) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        monthInput.value = `${year}-${month}`;
    }
    const allMonthsChecked = document.getElementById('all-months').checked;
    const selectedMonth = allMonthsChecked ? '' : monthInput.value;

    const paymentHistoryList = document.getElementById('payment-history-list');
    paymentHistoryList.innerHTML = '';

    let allPayments = [];
    let totalAmount = 0;
    let monthlyAmount = 0;

    tenants.forEach(tenant => {
        if (!selectedTenant || tenant.id === parseInt(selectedTenant)) {
            if (tenant.paymentHistory) {
                tenant.paymentHistory.forEach((payment, index) => {
                    const paymentDate = new Date(payment.date);
                    const isSelectedMonth = !selectedMonth || payment.date.startsWith(selectedMonth);
                    
                    if (isSelectedMonth) {
                        allPayments.push({
                            ...payment,
                            tenantName: tenant.tenantName,
                            roomNumber: tenant.roomNumber,
                            tenantId: tenant.id,
                            paymentIndex: index
                        });
                        monthlyAmount += parseFloat(payment.amount) || 0;
                    }
                    totalAmount += parseFloat(payment.amount) || 0;
                });
            }
        }
    });

    // Update payment summaries
    document.getElementById('total-payments').textContent = `₹${formatIndianNumber(Math.round(totalAmount))}`;
    
    // Always show monthly summary since we're showing current month by default
    const monthlySummary = document.getElementById('monthly-summary');
    monthlySummary.style.display = 'block';
    document.getElementById('monthly-payments').textContent = `₹${formatIndianNumber(Math.round(monthlyAmount))}`;

    if (allPayments.length === 0) {
        paymentHistoryList.innerHTML = '<p class="no-tenants">No payment history found.</p>';
        return;
    }

    // Sort payments by date (newest first)
    allPayments.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Create a table for better organization
    const table = document.createElement('table');
    table.className = 'payment-history-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Date</th>
                <th>Tenant</th>
                <th>Room</th>
                <th>Amount</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            ${allPayments.map(payment => `
                <tr>
                    <td>${new Date(payment.date).toLocaleDateString()}</td>
                    <td>${payment.tenantName}</td>
                    <td>${payment.roomNumber}</td>
                    <td>₹${formatIndianNumber(Math.round(payment.amount))}</td>
                    <td>
                        <button onclick="editPayment(${payment.tenantId}, ${payment.paymentIndex})" class="edit-btn">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="deletePayment(${payment.tenantId}, ${payment.paymentIndex})" class="delete-btn">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `).join('')}
        </tbody>
    `;

    paymentHistoryList.appendChild(table);
}

// Edit payment
async function editPayment(tenantId, paymentIndex) {
    const currentPlot = getCurrentPlot();
    const plotKey = getPlotStorageKey(currentPlot);
    const tenants = JSON.parse(localStorage.getItem(plotKey) || '[]');
    const tenant = tenants.find(t => t.id === Number(tenantId));

    if (!tenant || !tenant.paymentHistory || !tenant.paymentHistory[paymentIndex]) {
        alert('Payment not found');
        return;
    }

    // Remove any existing payment form
    const existingForm = document.querySelector('.payment-form');
    if (existingForm) {
        existingForm.remove();
    }

    const form = document.createElement('form');
    form.className = 'payment-form';
    form.innerHTML = `
        <h3>Edit Payment</h3>
        <div class="form-group">
            <label for="paymentAmount">Payment Amount</label>
            <input type="number" id="paymentAmount" required min="0" step="0.01" value="${tenant.paymentHistory[paymentIndex].amount}">
        </div>
        <div class="form-group">
            <label for="paymentDate">Payment Date</label>
            <input type="date" id="paymentDate" required value="${tenant.paymentHistory[paymentIndex].date}">
        </div>
        <div class="form-actions">
            <button type="submit">Update Payment</button>
            <button type="button" onclick="closePaymentForm()">Cancel</button>
        </div>
    `;

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const amount = parseFloat(document.getElementById('paymentAmount').value);
        const date = document.getElementById('paymentDate').value;

        // Update payment in history
        tenant.paymentHistory[paymentIndex] = {
            amount: amount,
            date: date
        };

        // Recalculate previous due
        const totalRentDue = calculateRentDue(tenant);
        const totalElectricityDue = calculateElectricityDue(tenant);
        tenant.previousDue = totalRentDue + totalElectricityDue;

        // Save tenant data
        await saveTenant(tenant);
        
        // Close form and refresh display
        closePaymentForm();
        loadPaymentHistory();
        loadTenants();
        updateDashboardStats();
    });

    document.body.appendChild(form);
}

// Delete payment
async function deletePayment(tenantId, paymentIndex) {
    if (!confirm('Are you sure you want to delete this payment?')) {
        return;
    }

    const currentPlot = getCurrentPlot();
    const plotKey = getPlotStorageKey(currentPlot);
    const tenants = JSON.parse(localStorage.getItem(plotKey) || '[]');
    const tenant = tenants.find(t => t.id === Number(tenantId));

    if (!tenant || !tenant.paymentHistory) {
        alert('Payment not found');
        return;
    }

    // Remove payment from history
    tenant.paymentHistory.splice(paymentIndex, 1);

    // Recalculate previous due
    const totalRentDue = calculateRentDue(tenant);
    const totalElectricityDue = calculateElectricityDue(tenant);
    tenant.previousDue = totalRentDue + totalElectricityDue;

    // Save tenant data
    await saveTenant(tenant);
    
    // Refresh display
    loadPaymentHistory();
    loadTenants();
    updateDashboardStats();

    // If Monthly History tab is active, reload it to reflect changes
    const monthlySection = document.getElementById('monthly-history');
    if (monthlySection && monthlySection.style.display === 'block') {
        loadMonthlyHistory();
    }
}

// Add a function to check Firebase connection
async function checkFirebaseConnection() {
    try {
        const testDoc = await db.collection('test').doc('connection-test').get();
        console.log('Firebase connection successful');
        return true;
    } catch (error) {
        console.error('Firebase connection failed:', error);
        return false;
    }
}

// Add a function to check Firebase rules
async function checkFirebaseRules() {
    try {
        // Try to write a test document
        await db.collection('test').doc('permission-test').set({
            timestamp: new Date().toISOString()
        });
        
        // Try to read the test document
        const doc = await db.collection('test').doc('permission-test').get();
        
        // Clean up the test document
        await db.collection('test').doc('permission-test').delete();
        
        console.log('Firebase rules are properly configured');
        return true;
    } catch (error) {
        if (error.code === 'permission-denied') {
            console.error('Firebase permission error. Please check your security rules in the Firebase Console.');
            alert('Database access denied. Please check Firebase security rules.');
        } else {
            console.error('Firebase error:', error);
        }
        return false;
    }
}

// Edit tenant
function editTenant(tenantId) {
    const currentPlot = getCurrentPlot();
    const plotKey = getPlotStorageKey(currentPlot);
    const tenants = JSON.parse(localStorage.getItem(plotKey) || '[]');
    const tenant = tenants.find(t => t.id === Number(tenantId));

    if (!tenant) {
        alert('Tenant not found');
        return;
    }

    // Remove any existing edit form
    const existingForm = document.querySelector('.edit-form');
    if (existingForm) {
        existingForm.remove();
    }

    const form = document.createElement('form');
    form.className = 'edit-form';
    form.innerHTML = `
        <div class="edit-form-container">
            <div class="edit-form-header">
                <h3>Edit Tenant Details</h3>
                <button type="button" class="close-btn" onclick="closeEditForm()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="edit-form-content">
                <div class="form-group">
                    <label for="editTenantName">Tenant Name</label>
                    <input type="text" id="editTenantName" value="${tenant.tenantName}" required>
                </div>
                <div class="form-group">
                    <label for="editRoomNumber">Room Number</label>
                    <input type="text" id="editRoomNumber" value="${tenant.roomNumber}" required>
                </div>
                <div class="form-group">
                    <label for="editStartDate">Start Date</label>
                    <input type="date" id="editStartDate" value="${tenant.startDate}" required>
                </div>
                <div class="form-group">
                    <label for="editEndDate">End Date (Leave empty for active tenant)</label>
                    <input type="date" id="editEndDate" value="${tenant.endDate || ''}">
                </div>
                <div class="form-group">
                    <label for="editMonthlyRent">Monthly Rent</label>
                    <input type="number" id="editMonthlyRent" value="${tenant.monthlyRent}" required min="0" step="0.01">
                </div>
                <div class="form-group">
                    <label for="editAdvancePaid">Advance Paid</label>
                    <input type="number" id="editAdvancePaid" value="${tenant.advancePaid}" required min="0" step="0.01">
                </div>
                <div class="form-group">
                    <label for="editElectricityRate">Electricity Rate (per unit)</label>
                    <input type="number" id="editElectricityRate" value="${tenant.electricityRate || DEFAULT_ELECTRICITY_RATE}" required min="0" step="0.01">
                </div>
                <div class="form-group">
                    <label for="editStartingDue">Starting Due Amount</label>
                    <input type="number" id="editStartingDue" value="${tenant.startingDue || 0}" min="0" step="0.01">
                </div>
            </div>
            <div class="edit-form-footer">
                <button type="button" class="cancel-btn" onclick="closeEditForm()">
                    <i class="fas fa-times"></i> Cancel
                </button>
                <button type="submit" class="submit-btn">
                    <i class="fas fa-save"></i> Save Changes
                </button>
            </div>
        </div>
    `;

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Update tenant data
        tenant.tenantName = document.getElementById('editTenantName').value;
        tenant.roomNumber = document.getElementById('editRoomNumber').value;
        tenant.startDate = document.getElementById('editStartDate').value;
        tenant.endDate = document.getElementById('editEndDate').value || null;
        tenant.monthlyRent = parseFloat(document.getElementById('editMonthlyRent').value);
        tenant.advancePaid = parseFloat(document.getElementById('editAdvancePaid').value);
        tenant.electricityRate = parseFloat(document.getElementById('editElectricityRate').value);
        tenant.startingDue = parseFloat(document.getElementById('editStartingDue').value) || 0;

        // Save tenant data
        await saveTenant(tenant);
        
        // Close form and refresh display
        closeEditForm();
        loadTenants();
        updateDashboardStats();
    });

    document.body.appendChild(form);
}

// Close edit form
function closeEditForm() {
    const editForm = document.querySelector('.edit-form');
    if (editForm) {
        editForm.remove();
    }
}

// ============= Theme Management =============

// Theme variables
const THEMES = {
    light: {
        '--background-color': '#f3f4f6',
        '--card-background': '#ffffff',
        '--text-primary': '#1f2937',
        '--text-secondary': '#4b5563',
        '--border-color': '#e5e7eb',
        '--primary-color': '#3b82f6',
        '--primary-hover': '#2563eb',
        '--danger-color': '#ef4444',
        '--success-color': '#22c55e',
        '--shadow-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        '--shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        '--shadow-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
    },
    dark: {
        '--background-color': '#111827',
        '--card-background': '#1f2937',
        '--text-primary': '#f9fafb',
        '--text-secondary': '#d1d5db',
        '--border-color': '#374151',
        '--primary-color': '#3b82f6',
        '--primary-hover': '#60a5fa',
        '--danger-color': '#ef4444',
        '--success-color': '#22c55e',
        '--shadow-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
        '--shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.4)',
        '--shadow-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.4)'
    }
};

// Initialize theme
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);
    updateThemeToggleIcon(savedTheme);
}

// Apply theme to document
function applyTheme(theme) {
    const root = document.documentElement;
    const themeColors = THEMES[theme];
    
    Object.entries(themeColors).forEach(([property, value]) => {
        root.style.setProperty(property, value);
    });
    
    root.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
}

// Update theme toggle icon
function updateThemeToggleIcon(theme) {
    const themeToggle = document.querySelector('.theme-toggle');
    if (!themeToggle) return;

    themeToggle.innerHTML = theme === 'light' 
        ? '<i class="fas fa-moon"></i><i class="fas fa-sun"></i>'
        : '<i class="fas fa-moon"></i><i class="fas fa-sun"></i>';
}

// Toggle theme
function toggleTheme() {
    const currentTheme = localStorage.getItem('theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(newTheme);
}

// Add theme toggle button to DOM
function addThemeToggle() {
    // Remove existing toggle if any
    const existingToggle = document.querySelector('.theme-toggle');
    if (existingToggle) {
        existingToggle.remove();
    }

    const themeToggle = document.createElement('button');
    themeToggle.className = 'theme-toggle';
    themeToggle.setAttribute('aria-label', 'Toggle theme');
    themeToggle.innerHTML = '<i class="fas fa-moon"></i><i class="fas fa-sun"></i>';
    themeToggle.onclick = toggleTheme;
    document.body.appendChild(themeToggle);
}

// Initialize theme and toggle when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    addThemeToggle();
    initializeTheme();
});

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem('theme')) {
        applyTheme(e.matches ? 'dark' : 'light');
    }
});

// Calculate current month's rent
function calculateCurrentMonthRent(tenant) {
    return tenant.endDate ? 0 : tenant.monthlyRent;
}

// Calculate total amount due for a tenant (rent + electricity + previous balance)
function calculateTotalAmountDue(tenant) {
    // Do not add current month rent if tenant is vacated
    const currentMonthRent = tenant.endDate ? 0 : tenant.monthlyRent;
    const currentMonthElectricityBill = calculateCurrentMonthBill(tenant);
    const previousBalance = tenant.previousDue || 0;

    return currentMonthRent + currentMonthElectricityBill + previousBalance;
}

// Add electricity reading with validation
async function addElectricityReading(tenantId) {
    const currentPlot = getCurrentPlot();
    const plotKey = getPlotStorageKey(currentPlot);
    const tenants = JSON.parse(localStorage.getItem(plotKey) || '[]');
    const tenant = tenants.find(t => t.id === Number(tenantId));

    if (!tenant) {
        alert('Tenant not found');
        return;
    }

    const reading = prompt('Enter new electricity reading:');
    if (reading === null) return;

    const readingValue = parseFloat(reading);
    if (isNaN(readingValue)) {
        alert('Please enter a valid number');
        return;
    }

    // Get the last reading
    const lastReading = tenant.electricityReadings[tenant.electricityReadings.length - 1];
    
    // Validate that new reading is not less than the last reading
    if (lastReading && readingValue < lastReading.reading) {
        alert('New reading cannot be less than the last reading. Please check the reading value.');
        return;
    }

    // Add new reading
    tenant.electricityReadings.push({
        reading: readingValue,
        date: new Date().toISOString().split('T')[0]
    });

    // Calculate current month's bill
    const currentMonthBill = calculateCurrentMonthBill(tenant);
    
    // Update previous due
    tenant.previousDue = tenant.monthlyRent + currentMonthBill;

    // Save tenant data
    await saveTenant(tenant);
    loadTenants();
    updateDashboardStats();

    // Show bill calculation
    alert(`Current month's electricity bill: ₹${currentMonthBill}`);
}

// Add new tenant
function addNewTenant() {
    // Remove any existing form
    const existingForm = document.querySelector('.add-tenant-form');
    if (existingForm) {
        existingForm.remove();
    }

    const form = document.createElement('form');
    form.className = 'add-tenant-form';
    form.innerHTML = `
        <h3>Add New Tenant</h3>
        <div class="form-group">
            <label for="tenantName">Tenant Name</label>
            <input type="text" id="tenantName" required>
        </div>
        <div class="form-group">
            <label for="roomNumber">Room Number</label>
            <input type="text" id="roomNumber" required>
        </div>
        <div class="form-group">
            <label for="startDate">Start Date</label>
            <input type="date" id="startDate" required>
        </div>
        <div class="form-group">
            <label for="monthlyRent">Monthly Rent</label>
            <input type="number" id="monthlyRent" required min="0" step="0.01">
        </div>
        <div class="form-group">
            <label for="advancePaid">Advance Paid</label>
            <input type="number" id="advancePaid" required min="0" step="0.01">
        </div>
        <div class="form-group">
            <label for="electricityRate">Electricity Rate (per unit)</label>
            <input type="number" id="electricityRate" value="${DEFAULT_ELECTRICITY_RATE}" required min="0" step="0.01">
        </div>
        <div class="form-actions">
            <button type="submit">Add Tenant</button>
            <button type="button" onclick="closeAddTenantForm()">Cancel</button>
        </div>
    `;

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const tenant = {
            id: Date.now(),
            tenantName: document.getElementById('tenantName').value,
            roomNumber: document.getElementById('roomNumber').value,
            startDate: document.getElementById('startDate').value,
            monthlyRent: parseFloat(document.getElementById('monthlyRent').value),
            advancePaid: parseFloat(document.getElementById('advancePaid').value),
            electricityRate: parseFloat(document.getElementById('electricityRate').value),
            electricityReadings: [],
            paymentHistory: [],
            previousDue: 0
        };

        // Save tenant data
        await saveTenant(tenant);
        
        // Close form and refresh display
        closeAddTenantForm();
        loadTenants();
        updateDashboardStats();
    });

    document.body.appendChild(form);
}

// Add tenant status filter
function addTenantStatusFilter() {
    const filterContainer = document.createElement('div');
    filterContainer.className = 'tenant-filter';
    filterContainer.innerHTML = `
        <div class="filter-options">
            <button class="filter-btn" data-status="all">All Tenants</button>
            <button class="filter-btn active" data-status="active">Active Tenants</button>
            <button class="filter-btn" data-status="past">Past Tenants</button>
        </div>
    `;

    const tenantsList = document.getElementById('tenants-list');
    tenantsList.parentNode.insertBefore(filterContainer, tenantsList);

    // Add event listeners to filter buttons
    const filterButtons = filterContainer.querySelectorAll('.filter-btn');
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Update active button
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Filter tenants
            const status = button.getAttribute('data-status');
            tenantStatusFilter = status; // persist preference
            filterTenants(status);
        });
    });

    // Show active tenants by default
    tenantStatusFilter = 'active';
    filterTenants('active');
}

// Filter tenants based on status
function filterTenants(status) {
    const currentPlot = getCurrentPlot();
    const plotKey = getPlotStorageKey(currentPlot);
    const tenants = JSON.parse(localStorage.getItem(plotKey) || '[]');
    
    tenantStatusFilter = status;
    displayTenants(tenants);
}

// Data Management Functions
function handleDataExport() {
    try {
        const currentPlot = getCurrentPlot();
        const plotKey = getPlotStorageKey(currentPlot);
        const data = JSON.parse(localStorage.getItem(plotKey) || '[]');
        
        if (data.length === 0) {
            alert('No data to export!');
            return;
        }

        // Create a blob with the data
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        
        // Create a download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rent_data_${currentPlot}_${new Date().toISOString().split('T')[0]}.json`;
        
        // Trigger the download
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Export error:', error);
        alert('Error exporting data: ' + error.message);
    }
}

// ---------- Vacate Tenant Helpers ----------
// Open a small form with a proper date selector for vacating a tenant
function openVacateForm(tenantId) {
    // Remove any existing vacate form
    const existing = document.querySelector('.vacate-form');
    if (existing) existing.remove();

    const form = document.createElement('form');
    form.className = 'vacate-form';
    const defaultDate = new Date().toISOString().split('T')[0];
    form.innerHTML = `
        <h3>Mark Tenant Vacated</h3>
        <div class="form-group">
            <label for="vacateDate">Vacate Date</label>
            <input type="date" id="vacateDate" required value="${defaultDate}">
        </div>
        <div class="form-actions">
            <button type="submit">Save</button>
            <button type="button" id="cancelVacate">Cancel</button>
        </div>
    `;

    document.body.appendChild(form);

    document.getElementById('cancelVacate').addEventListener('click', () => form.remove());

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const date = document.getElementById('vacateDate').value;
        await markTenantVacated(tenantId, date);
        form.remove();
    });
}

// Mark tenant as vacated by setting endDate
async function markTenantVacated(tenantId, customDate = null) {
    const currentPlot = getCurrentPlot();
    const plotKey = getPlotStorageKey(currentPlot);
    const tenants = JSON.parse(localStorage.getItem(plotKey) || '[]');
    const tenant = tenants.find(t => t.id === Number(tenantId));

    if (!tenant) {
        alert('Tenant not found');
        return;
    }

    if (tenant.endDate) {
        alert('Tenant is already marked as vacated.');
        return;
    }

    const endDate = customDate || new Date().toISOString().split('T')[0];

    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        alert('Invalid date format. Please use YYYY-MM-DD.');
        return;
    }

    const end = new Date(endDate);
    if (isNaN(end.getTime())) {
        alert('Invalid date.');
        return;
    }

    const start = new Date(tenant.startDate);
    if (end < start) {
        alert('End date cannot be before start date.');
        return;
    }

    tenant.endDate = endDate;
    tenant.isActive = false;

    // Recalculate dues up to endDate
    tenant.previousDue = calculatePreviousDue(tenant);

    await saveTenant(tenant);
    loadTenants();
    updateDashboardStats();
}

// Add this at the end of the file
document.addEventListener('DOMContentLoaded', function() {
    // Add click handlers for collapsible sections
    document.addEventListener('click', function(e) {
        if (e.target.matches('.info-section[data-section="basic-info"] h4, .info-section[data-section="electricity"] h4')) {
            const section = e.target.parentElement;
            section.classList.toggle('expanded');
        }
    });
});

// ============== Service Worker Update UX ==============
let userAcceptedSwUpdate = false;

function showUpdateBanner(onUpdate) {
    let banner = document.querySelector('.update-notification');
    if (!banner) {
        banner = document.createElement('div');
        banner.className = 'update-notification';
        banner.innerHTML = `
            <div class="update-content">
                <i class="fas fa-sync"></i>
                <span>New version available.</span>
                <button type="button" class="apply-update">Update</button>
                <button type="button" class="dismiss-update" style="margin-left: 8px; background: transparent; color: #fff; border: 1px solid rgba(255,255,255,0.4)">Later</button>
            </div>
        `;
        document.body.appendChild(banner);
    }
    const applyBtn = banner.querySelector('.apply-update');
    const dismissBtn = banner.querySelector('.dismiss-update');
    applyBtn.onclick = () => {
        userAcceptedSwUpdate = true;
        onUpdate?.();
        banner.remove();
    };
    dismissBtn.onclick = () => banner.remove();
}

function setupServiceWorkerUpdatePrompt() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('/service-worker.js', { scope: '/', updateViaCache: 'none' });

            // If there's a waiting worker already, prompt immediately
            if (registration.waiting) {
                showUpdateBanner(() => registration.waiting.postMessage('skipWaiting'));
            }

            // When a new worker is found
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                if (!newWorker) return;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed') {
                        if (navigator.serviceWorker.controller) {
                            // Updated content available
                            showUpdateBanner(() => {
                                if (registration.waiting) {
                                    registration.waiting.postMessage('skipWaiting');
                                }
                            });
                        }
                    }
                });
            });

            // Reload only after the user accepted update
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (userAcceptedSwUpdate) {
                    window.location.reload();
                }
            });
        } catch (error) {
            console.error('SW registration failed:', error);
        }
    });
}

// Function to format number with commas
function formatNumberWithCommas(number) {
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Function to format number in Indian system (lakhs and crores)
function formatIndianNumber(number) {
    const numStr = number.toString();
    const lastThree = numStr.substring(numStr.length - 3);
    const otherNumbers = numStr.substring(0, numStr.length - 3);
    const formatted = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + (otherNumbers ? "," : "") + lastThree;
    return formatted;
}

// Standardized INR currency formatter
const inrFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function formatINR(amount) {
    const value = Number.isFinite(amount) ? amount : 0;
    return inrFormatter.format(Math.round(value));
}

// Function to calculate current month's total payments
function calculateCurrentMonthPayments() {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();
    
    let totalPayments = 0;
    
    // Get current plot's tenants
    const currentPlot = getCurrentPlot();
    const plotKey = getPlotStorageKey(currentPlot);
    const tenants = JSON.parse(localStorage.getItem(plotKey) || '[]');
    
    // Calculate total payments from all tenants' (both active and past) payment histories
    tenants.forEach(tenant => {
        if (tenant.paymentHistory) {
            tenant.paymentHistory.forEach(payment => {
                const paymentDate = new Date(payment.date);
                if (paymentDate.getMonth() === currentMonth && paymentDate.getFullYear() === currentYear) {
                    totalPayments += parseFloat(payment.amount) || 0;
                }
            });
        }
    });
    
    // Update the display with rounded number in Indian format
    document.getElementById('current-month-payments').textContent = formatINR(totalPayments);
}

// Initialize sidebar toggle
function initializeSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const contentArea = document.querySelector('.content-area');
    
    // Check if we're on mobile
    const isMobile = window.innerWidth <= 768;
    
    // Set initial state
    if (isMobile) {
        sidebar.classList.remove('active');
        contentArea.classList.remove('sidebar-active');
    }
    
    // Toggle sidebar
    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
        contentArea.classList.toggle('sidebar-active');
        
        // Update toggle icon
        const icon = sidebarToggle.querySelector('i');
        if (sidebar.classList.contains('active')) {
            icon.classList.remove('fa-bars');
            icon.classList.add('fa-times');
        } else {
            icon.classList.remove('fa-times');
            icon.classList.add('fa-bars');
        }
    });
    
    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (isMobile && 
            !sidebar.contains(e.target) && 
            !sidebarToggle.contains(e.target) && 
            sidebar.classList.contains('active')) {
            sidebar.classList.remove('active');
            contentArea.classList.remove('sidebar-active');
            const icon = sidebarToggle.querySelector('i');
            icon.classList.remove('fa-times');
            icon.classList.add('fa-bars');
        }
    });
    
    // Handle window resize
    window.addEventListener('resize', () => {
        const isMobile = window.innerWidth <= 768;
        if (!isMobile) {
            sidebar.classList.remove('active');
            contentArea.classList.remove('sidebar-active');
            const icon = sidebarToggle.querySelector('i');
            icon.classList.remove('fa-times');
            icon.classList.add('fa-bars');
        }
    });
}

function updateCombinedStats() {
    let combinedTenants = 0;
    let combinedDue = 0;
    let combinedPayments = 0;
    let combinedMonthlyRent = 0;
    let combinedMonthlyBill = 0;

    // Calculate stats for each plot
    PLOTS.forEach(plot => {
        const tenants = getTenants(plot);
        const activeTenants = tenants.filter(t => !t.endDate);
        
        combinedTenants += activeTenants.length;
        
        // Calculate total due for ACTIVE tenants only in this plot
        const plotDue = activeTenants.reduce((sum, tenant) => sum + calculatePreviousDue(tenant), 0);
        combinedDue += plotDue;

        // Get all tenants for this plot
        const plotKey = getPlotStorageKey(plot);
        const allTenants = JSON.parse(localStorage.getItem(plotKey) || '[]');
        
        // Calculate monthly rent for this plot (all tenants)
        const plotMonthlyRent = allTenants.reduce((sum, tenant) => {
            const rent = tenant.monthlyRent || 0;
            return sum + rent;
        }, 0);
        combinedMonthlyRent += plotMonthlyRent;

        // Calculate monthly bill for this plot (all tenants)
        const plotMonthlyBill = allTenants.reduce((sum, tenant) => {
            const bill = calculateCurrentMonthBill(tenant);
            return sum + bill;
        }, 0);
        combinedMonthlyBill += plotMonthlyBill;

        // Calculate current month payments for this plot (including both active and past tenants)
        const currentMonth = new Date().toISOString().slice(0, 7);
        const plotPayments = tenants.reduce((sum, tenant) => {
            const tenantPayments = tenant.paymentHistory || [];
            const currentMonthPayments = tenantPayments
                .filter(payment => payment.date.startsWith(currentMonth))
                .reduce((paymentSum, payment) => paymentSum + (payment.amount || 0), 0);
            return sum + currentMonthPayments;
        }, 0);
        combinedPayments += plotPayments;
    });

    // Update combined stats display
    document.getElementById('combined-total-tenants').textContent = formatIndianNumber(combinedTenants);
    document.getElementById('combined-total-rent').textContent = formatINR(combinedDue);
    document.getElementById('combined-total-monthly-rent').textContent = formatINR(combinedMonthlyRent);
    document.getElementById('combined-total-monthly-bill').textContent = formatINR(combinedMonthlyBill);
    document.getElementById('combined-current-month-payments').textContent = formatINR(combinedPayments);
}

// Sync data with Firebase
async function handleDataSync() {
    const syncStatus = document.getElementById('sync-status');
    const syncMessage = syncStatus.querySelector('.sync-message');
    const syncBtn = document.getElementById('sync-data');
    
    try {
        // Show syncing status
        syncStatus.style.display = 'flex';
        syncStatus.className = 'sync-status syncing';
        syncMessage.innerHTML = '<i class="fas fa-sync fa-spin"></i> Syncing data...';
        syncBtn.disabled = true;

        // Get current plot
        const currentPlot = getCurrentPlot();
        const plotKey = getPlotStorageKey(currentPlot);
        const tenants = JSON.parse(localStorage.getItem(plotKey) || '[]');

        // Clear existing batch queue
        CacheManager.batchQueue = [];
        
        // Add all tenants to batch queue for sync
        for (const tenant of tenants) {
            CacheManager.addToBatch({
                type: 'set',
                path: `tenants/${tenant.id}`,
                data: tenant
            });
        }
        
        // Process the batch
        await CacheManager.processBatch();
        
        // Invalidate cache to force fresh data load
        CacheManager.invalidateCache(currentPlot);
        
        // Load latest data from Firebase (will use fresh cache)
        await loadTenantsFromFirebase();

        // Show success status
        syncStatus.className = 'sync-status success';
        syncMessage.innerHTML = '<i class="fas fa-check-circle"></i> Data synced successfully!';
        
        // Hide status after 3 seconds
        setTimeout(() => {
            syncStatus.style.display = 'none';
        }, 3000);
    } catch (error) {
        console.error('Sync error:', error);
        
        // Show error status
        syncStatus.className = 'sync-status error';
        syncMessage.innerHTML = `<i class="fas fa-exclamation-circle"></i> Sync failed: ${error.message}`;
        
        // Hide status after 5 seconds
        setTimeout(() => {
            syncStatus.style.display = 'none';
        }, 5000);
    } finally {
        syncBtn.disabled = false;
    }
}

// Edit electricity reading
async function editElectricityReading(tenantId, readingIndex) {
    const currentPlot = getCurrentPlot();
    const plotKey = getPlotStorageKey(currentPlot);
    const tenants = JSON.parse(localStorage.getItem(plotKey) || '[]');
    const tenant = tenants.find(t => t.id === Number(tenantId));

    if (!tenant) {
        alert('Tenant not found');
        return;
    }

    if (!tenant.electricityReadings || !tenant.electricityReadings[readingIndex]) {
        alert('Reading not found');
        return;
    }

    const reading = tenant.electricityReadings[readingIndex];
    const newReading = prompt('Enter new electricity reading:', reading.reading);
    if (newReading === null) return;

    const readingValue = parseFloat(newReading);
    if (isNaN(readingValue)) {
        alert('Please enter a valid number');
        return;
    }

    // Validate reading value
    if (readingIndex > 0 && readingValue < tenant.electricityReadings[readingIndex - 1].reading) {
        alert('New reading cannot be less than the previous reading');
        return;
    }
    if (readingIndex < tenant.electricityReadings.length - 1 && readingValue > tenant.electricityReadings[readingIndex + 1].reading) {
        alert('New reading cannot be greater than the next reading');
        return;
    }

    // Update reading
    tenant.electricityReadings[readingIndex].reading = readingValue;

    // Recalculate bills and update previous due
    const currentMonthBill = calculateCurrentMonthBill(tenant);
    tenant.previousDue = tenant.monthlyRent + currentMonthBill;

    // Save tenant data
    await saveTenant(tenant);
    loadTenants();
    updateDashboardStats();

    alert('Reading updated successfully');
}

// Load monthly history
function loadMonthlyHistory() {
    // Use cache if available
    const cached = getCachedMonthlyData();
    if (cached && Array.isArray(cached) && cached.length) {
        // Update header stats with latest month from cache
        const latest = cached[0];
        document.getElementById('monthly-total-rent').textContent = `₹${formatIndianNumber(Math.round(latest.totalRent))}`;
        document.getElementById('monthly-total-bills').textContent = `₹${formatIndianNumber(Math.round(latest.totalBills))}`;
        document.getElementById('monthly-total-payments').textContent = `₹${formatIndianNumber(Math.round(latest.totalPayments))}`;

        // Also update cumulative totals till now using cached data
        const totalPaymentsTillNow = cached.reduce((sum, m) => sum + m.totalPayments, 0);
        const totalBillsTillNow = cached.reduce((sum, m) => sum + m.totalBills, 0);
        document.getElementById('total-payments-till-now').textContent = `₹${formatIndianNumber(Math.round(totalPaymentsTillNow))}`;
        document.getElementById('total-bills-till-now').textContent = `₹${formatIndianNumber(Math.round(totalBillsTillNow))}`;
        renderMonthlyBreakdown(cached, 0);
        return; // Skip recomputation
    }

    // Compute afresh if no cache
    // Get data from all plots
    const allTenants = [];
    PLOTS.forEach(plot => {
        const plotKey = getPlotStorageKey(plot);
        const tenants = JSON.parse(localStorage.getItem(plotKey) || '[]');
        allTenants.push(...tenants);
    });
    
    // Get all months from tenant data
    const months = new Set();
    allTenants.forEach(tenant => {
        // Add months from payment history
        tenant.paymentHistory?.forEach(payment => {
            const date = new Date(payment.date);
            months.add(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
        });
        
        // Add months from electricity readings
        tenant.electricityReadings?.forEach(reading => {
            const date = new Date(reading.date);
            months.add(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
        });
    });
    
    // Convert to array and sort in descending order (latest first)
    const sortedMonths = Array.from(months).sort().reverse();
    
    // Calculate total payments and bills till now
    let totalPaymentsTillNow = 0;
    let totalBillsTillNow = 0;
    
    allTenants.forEach(tenant => {
        // Calculate total payments
        if (tenant.paymentHistory) {
            totalPaymentsTillNow += tenant.paymentHistory.reduce((sum, payment) => sum + payment.amount, 0);
        }
        
        // Calculate total bills
        if (tenant.electricityReadings && tenant.electricityReadings.length >= 2) {
            const startReading = tenant.electricityReadings[0];
            const lastReading = tenant.electricityReadings[tenant.electricityReadings.length - 1];
            const totalUnits = lastReading.reading - startReading.reading;
            totalBillsTillNow += totalUnits * (tenant.electricityRate || DEFAULT_ELECTRICITY_RATE);
        }
    });
    
    // Update total till now stats
    document.getElementById('total-payments-till-now').textContent = `₹${formatIndianNumber(Math.round(totalPaymentsTillNow))}`;
    document.getElementById('total-bills-till-now').textContent = `₹${formatIndianNumber(Math.round(totalBillsTillNow))}`;
    
    // Calculate monthly totals
    const monthlyData = sortedMonths.map(month => {
        const [year, monthNum] = month.split('-');
        const monthStart = new Date(year, monthNum - 1, 1);
        const monthEnd = new Date(year, monthNum, 0);
        
        let totalRent = 0;
        let totalBills = 0;
        let totalPayments = 0;
        
        allTenants.forEach(tenant => {
            // Calculate rent for the month
            if (tenant.startDate && new Date(tenant.startDate) <= monthEnd) {
                totalRent += getRentForMonth(tenant, year, monthNum);
            }
            
            // Calculate bills for the month
            const monthReadings = tenant.electricityReadings?.filter(reading => {
                const readingDate = new Date(reading.date);
                return readingDate >= monthStart && readingDate <= monthEnd;
            });
            
            if (monthReadings && monthReadings.length > 0) {
                // Identify index of the very first reading of this month in the tenant's full readings list
                const firstReadingThisMonth = monthReadings[0];
                const allIdx = tenant.electricityReadings.findIndex(r => r === firstReadingThisMonth);
                const prevReading = allIdx > 0 ? tenant.electricityReadings[allIdx - 1] : firstReadingThisMonth;
                const lastReadingThisMonth = monthReadings[monthReadings.length - 1];

                const units = lastReadingThisMonth.reading - prevReading.reading;
                if (units > 0) {
                    totalBills += units * (tenant.electricityRate || DEFAULT_ELECTRICITY_RATE);
                }
            }
            
            // Calculate payments for the month
            const monthPayments = tenant.paymentHistory?.filter(payment => {
                const paymentDate = new Date(payment.date);
                return paymentDate >= monthStart && paymentDate <= monthEnd;
            });
            
            if (monthPayments) {
                totalPayments += monthPayments.reduce((sum, payment) => sum + payment.amount, 0);
            }
        });
        
        return {
            month,
            totalRent,
            totalBills,
            totalPayments
        };
    });
    
    // Cache for future quick loads
    setCachedMonthlyData(monthlyData);

    // Update monthly stats with the latest month (first in the array)
    const currentMonth = monthlyData[0];
    if (currentMonth) {
        document.getElementById('monthly-total-rent').textContent = `₹${formatIndianNumber(Math.round(currentMonth.totalRent))}`;
        document.getElementById('monthly-total-bills').textContent = `₹${formatIndianNumber(Math.round(currentMonth.totalBills))}`;
        document.getElementById('monthly-total-payments').textContent = `₹${formatIndianNumber(Math.round(currentMonth.totalPayments))}`;
    }
    
    // Update monthly breakdown via pagination renderer
    renderMonthlyBreakdown(monthlyData, 0);
    /* Old inline rendering removed
    const breakdownHtml = monthlyData.map(data => {
        const [year, month] = data.month.split('-');
        const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
        const yearMonth = `${monthName} ${year}`;
        
        return `
            <div class="monthly-item">
                <div class="month">${yearMonth}</div>
                <div class="amount">Rent: ₹${formatIndianNumber(Math.round(data.totalRent))}</div>
                <div class="amount">Bills: ₹${formatIndianNumber(Math.round(data.totalBills))}</div>
                <div class="amount ${data.totalPayments >= (data.totalRent + data.totalBills) ? 'positive' : 'negative'}">
                    Payments: ₹${formatIndianNumber(Math.round(data.totalPayments))}
                </div>
            </div>
        `;
    }).join('');
    
        */
    // document.getElementById('monthly-breakdown').innerHTML = breakdownHtml;
}