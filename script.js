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

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    initializeNavigation();
    initializePlotTabs();
    loadTenants();
    setupEventListeners();
    updateDashboardStats();
    initializeTheme();
    addThemeToggle();
    addTenantStatusFilter();
    initializeSidebar();

    // Set tenants tab as active by default
    const tenantsTab = document.querySelector('.nav-btn[data-section="tenants"]');
    if (tenantsTab) {
        tenantsTab.click();
    }

    // Check Firebase connection in the background
    checkFirebaseConnection().then(isConnected => {
        if (isConnected) {
            console.log('Firebase is connected');
            checkFirebaseRules().then(hasPermissions => {
                if (hasPermissions) {
                    console.log('Firebase is ready to sync data');
                    // Load data from Firebase in the background
                    loadTenantsFromFirebase();
                } else {
                    console.error('Firebase permissions not properly configured');
                }
            });
        } else {
            console.error('Firebase connection failed. Data will be stored locally only.');
        }
    });
});

// Load tenants from Firestore in the background
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
        
        if (tenants.length > 0) {
            const plotKey = getPlotStorageKey(currentPlot);
            localStorage.setItem(plotKey, JSON.stringify(tenants));
            displayTenants(tenants);
            updateTenantSelect(tenants);
            updateDashboardStats();
        }
    } catch (error) {
        console.error('Error loading from Firestore:', error);
    }
}

// Load tenants from localStorage
function loadTenants() {
    const currentPlot = getCurrentPlot();
    const plotKey = getPlotStorageKey(currentPlot);
    const tenants = JSON.parse(localStorage.getItem(plotKey) || '[]');
    displayTenants(tenants);
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

    // Add event listener for window unload to ensure data is saved
    window.addEventListener('beforeunload', () => {
        saveAllData();
    });
}

// Constants
const PLOTS = ['Home', 'Baba', 'Shop'];
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
                <span class="tenant-status ${isActive ? 'active' : 'past'}">
                    ${isActive ? 'Active' : 'Past'}
                </span>
            </h3>
            <div class="tenant-info">
                <div class="info-section" data-section="basic-info">
                    <h4><i class="fas fa-info-circle"></i> Basic Information</h4>
                    <p><strong>Room:</strong> ${tenant.roomNumber}</p>
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
    const searchTerm = e.target.value.toLowerCase();
    const currentPlot = getCurrentPlot();
    const plotKey = getPlotStorageKey(currentPlot);
    const tenants = JSON.parse(localStorage.getItem(plotKey) || '[]');
    
    const filteredTenants = tenants.filter(tenant => 
        tenant.tenantName.toLowerCase().includes(searchTerm) ||
        tenant.roomNumber.toLowerCase().includes(searchTerm)
    );
    
    displayTenants(filteredTenants);
}


// Calculate previous due based on total months minus 1 multiplied by rent, plus total electricity bill due, minus total payments made
function calculatePreviousDue(tenant) {
    const totalMonths = calculateMonthsDifference(tenant.startDate);
    const totalRentDue = totalMonths * tenant.monthlyRent;
    console.log(totalRentDue);
    const totalElectricityDue = calculateTotalElectricityBill(tenant);
    console.log(totalElectricityDue);
    const totalPaymentsMade = calculateTotalPayments(tenant);
    console.log(totalPaymentsMade);
    const startingDue = tenant.startingDue || 0;
    console.log(startingDue);
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

    document.body.appendChild(form);
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
    const tenant = tenants.find(t => t.id === tenantId);
    const payment = tenant.paymentHistory[paymentIndex];

    if (!tenant || !payment) {
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
            <input type="number" id="paymentAmount" required min="0" step="0.01" value="${payment.amount}">
        </div>
        <div class="form-group">
            <label for="paymentDate">Payment Date</label>
            <input type="date" id="paymentDate" required value="${payment.date}">
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
    const tenant = tenants.find(t => t.id === tenantId);

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
    const tenant = tenants.find(t => t.id === tenantId);

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
    return tenant.monthlyRent;
}

// Calculate total amount due for a tenant (rent + electricity + previous balance)
function calculateTotalAmountDue(tenant) {
    const currentMonthRent = tenant.monthlyRent;
    const currentMonthElectricityBill = calculateCurrentMonthBill(tenant);
    const previousBalance = tenant.previousDue || 0;
    return currentMonthRent + currentMonthElectricityBill + previousBalance;
}

// Add electricity reading with validation
async function addElectricityReading(tenantId) {
    const currentPlot = getCurrentPlot();
    const plotKey = getPlotStorageKey(currentPlot);
    const tenants = JSON.parse(localStorage.getItem(plotKey) || '[]');
    const tenant = tenants.find(t => t.id === tenantId);

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
            filterTenants(status);
        });
    });

    // Show active tenants by default
    filterTenants('active');
}

// Filter tenants based on status
function filterTenants(status) {
    const currentPlot = getCurrentPlot();
    const plotKey = getPlotStorageKey(currentPlot);
    const tenants = JSON.parse(localStorage.getItem(plotKey) || '[]');
    
    let filteredTenants = tenants;
    if (status === 'active') {
        filteredTenants = tenants.filter(tenant => !tenant.endDate);
    } else if (status === 'past') {
        filteredTenants = tenants.filter(tenant => tenant.endDate);
    }
    
    displayTenants(filteredTenants);
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
    
    // Calculate total payments from all tenants' payment histories
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
    document.getElementById('current-month-payments').textContent = `₹${formatIndianNumber(Math.round(totalPayments))}`;
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
