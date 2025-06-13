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

// Add at the top of the file after Firebase config
let currentSearchTerm = '';

// Register service worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('/service-worker.js', {
                updateViaCache: 'none'
            });
            console.log('ServiceWorker registration successful');

            // Handle controller change
            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (!refreshing) {
                    refreshing = true;
                    window.location.reload();
                }
            });
        } catch (error) {
            console.error('ServiceWorker registration failed:', error);
        }
    });
}

// Listen for the beforeinstallprompt event
window.addEventListener('beforeinstallprompt', (e) => {
    // Show the install prompt immediately
    e.prompt();
    
    // Wait for the user to respond to the prompt
    e.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
            console.log('User accepted the install prompt');
        } else {
            console.log('User dismissed the install prompt');
        }
    });
});

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    initializeNavigation();
    initializePlotTabs();
    initializeTheme();
    addThemeToggle();
    addTenantStatusFilter();
    initializeSidebar();

    // Set tenants tab as active by default
    const tenantsTab = document.querySelector('.nav-btn[data-section="tenants"]');
    if (tenantsTab) {
        tenantsTab.click();
    }

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
});

// Set up periodic data refresh
function setupPeriodicRefresh() {
    // Refresh data every 15 minutes
    setInterval(async () => {
        try {
            await loadTenantsFromFirebase();
            console.log('Data refreshed successfully');
        } catch (error) {
            console.error('Data refresh failed:', error);
        }
    }, 15 * 60 * 1000); // 15 minutes
}

// Load tenants from Firestore
async function loadTenantsFromFirebase() {
    const currentPlot = getCurrentPlot();
    try {
        const snapshot = await db.collection('tenants')
            .where('plotName', '==', currentPlot)
            .get();
            
        const tenants = [];
        snapshot.forEach(doc => {
            tenants.push(doc.data());
        });
        
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
    const plotKey = getPlotStorageKey(currentPlot);
    const tenants = JSON.parse(localStorage.getItem(plotKey) || '[]');
    
    // Apply search filter if exists
    const filteredTenants = currentSearchTerm ? tenants.filter(tenant => 
        tenant.tenantName.toLowerCase().includes(currentSearchTerm) ||
        tenant.roomNumber.toLowerCase().includes(currentSearchTerm)
    ) : tenants;
    
    displayTenants(filteredTenants);
    updateTenantSelect(tenants);
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
        tab.addEventListener('click', () => {
            // Remove active class from all tabs
            document.querySelectorAll('.plot-tab').forEach(t => t.classList.remove('active'));
            // Add active class to clicked tab
            tab.classList.add('active');
            // Load tenants for selected plot
            loadTenants();
            updateDashboardStats();
            // Refresh payment history if it's currently visible
            if (document.getElementById('payment-history').style.display === 'block') {
                loadPaymentHistory();
            }
        });
    });
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
    paymentTenantSelect.addEventListener('change', loadPaymentHistory);
    paymentMonth.addEventListener('change', loadPaymentHistory);

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
}

// Constants
const PLOTS = ['home', 'baba', 'shop', 'others'];
const DEFAULT_ELECTRICITY_RATE = 10;

// Utility Functions
function getCurrentPlot() {
    return document.querySelector('.plot-tab.active').getAttribute('data-plot');
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
    return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
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
    
    const lastReading = tenant.electricityReadings[tenant.electricityReadings.length - 1];
    const previousReading = tenant.electricityReadings[tenant.electricityReadings.length - 2];
    const currentMonthUnits = lastReading.reading - previousReading.reading;
    
    return currentMonthUnits * (tenant.electricityRate || DEFAULT_ELECTRICITY_RATE);
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
    const monthsDiff = calculateMonthsDifference(tenant.startDate);
    const totalRentDue = monthsDiff * tenant.monthlyRent;
    const totalPaid = calculateTotalPayments(tenant);
    const currentMonthBill = calculateCurrentMonthBill(tenant);
    return totalRentDue - totalPaid + tenant.previousDue + currentMonthBill;
}

// Data Management Functions
async function saveTenant(tenant) {
    const plotKey = getPlotStorageKey(tenant.plotName);
    const tenants = getTenants(tenant.plotName);
    const index = tenants.findIndex(t => t.id === tenant.id);
    
    if (index !== -1) {
        tenants[index] = tenant;
    } else {
        tenants.push(tenant);
    }
    
    localStorage.setItem(plotKey, JSON.stringify(tenants));
    
    try {
        await db.collection('tenants').doc(tenant.id.toString()).set(tenant);
    } catch (error) {
        console.error('Firebase save failed:', error);
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

        // Save to Firebase
        try {
            for (const tenant of data) {
                await db.collection('tenants').doc(tenant.id.toString()).set(tenant);
            }
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
            <h3>
                <i class="fas fa-user"></i> ${tenant.tenantName}
                <span class="room-number">Room ${tenant.roomNumber}</span>
                <span class="tenant-status ${isActive ? 'active' : 'past'}">
                    ${isActive ? 'Active' : 'Past'}
                </span>
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
                    <p><strong>Start Reading:</strong> ${startReading.reading} (${startReading.date === 'N/A' ? 'N/A' : formatDate(startReading.date)})</p>
                    <p><strong>Previous Reading:</strong> ${previousReading.reading} (${previousReading.date === 'N/A' ? 'N/A' : formatDate(previousReading.date)})</p>
                    <p><strong>Latest Reading:</strong> ${lastReading.reading} (${lastReading.date === 'N/A' ? 'N/A' : formatDate(lastReading.date)})</p>
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
                ` : ''}
                <button onclick="deleteTenant(${tenant.id})" class="delete-btn">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        </div>
    `;
}

// Update dashboard statistics
function updateDashboardStats() {
    const currentPlot = getCurrentPlot();
    const plotKey = getPlotStorageKey(currentPlot);
    const tenants = JSON.parse(localStorage.getItem(plotKey) || '[]');
    
    // Calculate total tenants
    document.getElementById('total-tenants').textContent = formatIndianNumber(tenants.length);
    
    // Calculate total due by summing up each tenant's total due
    const totalDue = tenants.reduce((sum, tenant) => {
        return sum + calculatePreviousDue(tenant);
    }, 0);
    
    document.getElementById('total-rent').textContent = `₹${formatIndianNumber(Math.round(totalDue))}`;
    
    // Add current month payments calculation
    calculateCurrentMonthPayments();

    // Calculate total monthly rent
    const totalMonthlyRent = tenants.reduce((sum, tenant) => {
        return sum + (tenant.monthlyRent || 0);
    }, 0);
    document.getElementById('total-monthly-rent').textContent = `₹${formatIndianNumber(Math.round(totalMonthlyRent))}`;

    // Calculate total monthly bill
    const totalMonthlyBill = tenants.reduce((sum, tenant) => {
        return sum + calculateCurrentMonthBill(tenant);
    }, 0);
    document.getElementById('total-monthly-bill').textContent = `₹${formatIndianNumber(Math.round(totalMonthlyBill))}`;

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

    if (tenants.length === 0) {
        tenantsList.innerHTML = '<p class="no-tenants">No tenants found.</p>';
        return;
    }

    tenants.forEach(tenant => {
        const tenantCard = document.createElement('div');
        tenantCard.innerHTML = createTenantCard(tenant);
        tenantsList.appendChild(tenantCard.firstElementChild);
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

// Handle search functionality
function handleSearch(e) {
    currentSearchTerm = e.target.value.toLowerCase();
    const currentPlot = getCurrentPlot();
    const plotKey = getPlotStorageKey(currentPlot);
    const tenants = JSON.parse(localStorage.getItem(plotKey) || '[]');
    
    const filteredTenants = tenants.filter(tenant => 
        tenant.tenantName.toLowerCase().includes(currentSearchTerm) ||
        tenant.roomNumber.toLowerCase().includes(currentSearchTerm)
    );
    
    displayTenants(filteredTenants);
}


// Calculate previous due based on total months minus 1 multiplied by rent, plus total electricity bill due, minus total payments made
function calculatePreviousDue(tenant) {
    const totalMonths = calculateMonthsDifference(tenant.startDate);
    const totalRentDue = totalMonths * tenant.monthlyRent;
    const totalElectricityDue = calculateTotalElectricityBill(tenant);
    const totalPaymentsMade = calculateTotalPayments(tenant);
    const startingDue = tenant.startingDue || 0;
    return totalRentDue + totalElectricityDue - totalPaymentsMade  + startingDue;
    
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
    const tenant = tenants.find(t => t.id === tenantId);

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
    const updatedTenants = tenants.filter(t => t.id !== tenantId);

    // Save to localStorage
    localStorage.setItem(plotKey, JSON.stringify(updatedTenants));

    // Save to Firebase
    try {
        await db.collection('tenants').doc(tenantId.toString()).delete();
    } catch (error) {
        console.error('Error deleting from Firebase:', error);
        alert('Error deleting from database. Please try again.');
        return;
    }

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
    const selectedMonth = monthInput.value;

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
    document.getElementById('monthly-payments').textContent = `