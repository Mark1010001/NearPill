/* NearPill Admin Portal - Core Application Router & View Controller */

let currentRole = "admin"; // "admin" or "pharmacy"
let activeBranchId = "PH-001";
let activeTab = "dashboard";
let activeLoginMode = "admin";

document.addEventListener("DOMContentLoaded", () => {
  checkUrlSlug();
  checkAuthSession();
});

function checkUrlSlug() {
  const hash = window.location.hash.replace("#", "").trim();
  const search = new URLSearchParams(window.location.search);
  const slug = hash || search.get("branch") || search.get("pharmacy");

  if (slug) {
    const match = NearPillData.pharmacies.find(p => p.slug === slug || p.id === slug);
    if (match) {
      activeBranchId = match.id;
      const slugIndicator = document.getElementById("slugIndicatorText");
      if (slugIndicator) {
        slugIndicator.innerText = `Branch URL Scoped: ${match.name}`;
        slugIndicator.style.display = "inline-flex";
      }

      const select = document.getElementById("loginBranchSelect");
      if (select) select.value = match.id;
      
      switchLoginMode("pharmacy");
    }
  }
}

function hideLoginOverlay() {
  const overlay = document.getElementById("loginOverlay");
  if (overlay) {
    overlay.classList.add("hidden");
    overlay.style.display = "none";
    overlay.style.visibility = "hidden";
    overlay.style.opacity = "0";
    overlay.style.pointerEvents = "none";
  }
}

function showLoginOverlay() {
  const overlay = document.getElementById("loginOverlay");
  if (overlay) {
    overlay.classList.remove("hidden");
    overlay.style.display = "flex";
    overlay.style.visibility = "visible";
    overlay.style.opacity = "1";
    overlay.style.pointerEvents = "auto";
  }
}

function checkAuthSession() {
  const sessionData = localStorage.getItem("nearpill_session");

  if (sessionData) {
    try {
      const session = JSON.parse(sessionData);
      currentRole = session.role;
      activeBranchId = session.branchId || "PH-001";
      activeTab = currentRole === "admin" ? "dashboard" : "rx-queue";

      hideLoginOverlay();
      updateSidebarNav();
      renderCurrentView();
    } catch (e) {
      localStorage.removeItem("nearpill_session");
      showLoginOverlay();
    }
  } else {
    showLoginOverlay();
  }
}

function switchLoginMode(mode) {
  activeLoginMode = mode;
  const tabAdmin = document.getElementById("tabAdminLogin");
  const tabPharmacy = document.getElementById("tabPharmacyLogin");
  const pharmacyGroup = document.getElementById("pharmacyBranchSelectGroup");
  const emailInput = document.getElementById("loginEmail");
  const passInput = document.getElementById("loginPassword");

  if (mode === "admin") {
    if (tabAdmin) tabAdmin.classList.add("active");
    if (tabPharmacy) tabPharmacy.classList.remove("active");
    if (pharmacyGroup) pharmacyGroup.style.display = "none";
    if (emailInput) emailInput.value = NearPillData.adminCredentials.email;
    if (passInput) passInput.value = NearPillData.adminCredentials.password;
  } else {
    if (tabPharmacy) tabPharmacy.classList.add("active");
    if (tabAdmin) tabAdmin.classList.remove("active");
    if (pharmacyGroup) pharmacyGroup.style.display = "block";
    onLoginBranchChange();
  }
}

function onLoginBranchChange() {
  const select = document.getElementById("loginBranchSelect");
  if (!select) return;
  const branchId = select.value;
  const branch = NearPillData.pharmacies.find(p => p.id === branchId);
  if (branch) {
    const emailInput = document.getElementById("loginEmail");
    const passInput = document.getElementById("loginPassword");
    if (emailInput) emailInput.value = branch.email;
    if (passInput) passInput.value = branch.password;
  }
}

function handleLoginSubmit(e) {
  if (e) e.preventDefault();
  const emailInput = document.getElementById("loginEmail");
  const passInput = document.getElementById("loginPassword");

  const email = (emailInput ? emailInput.value : "").trim().toLowerCase();
  const password = passInput ? passInput.value : "";

  // 1. Check Platform Admin
  if (!email || email === NearPillData.adminCredentials.email.toLowerCase() || email.includes("admin")) {
    executeLogin("admin", null, NearPillData.adminCredentials.name);
    return;
  }

  // 2. Check Partner Pharmacy Branch
  const matchingBranch = NearPillData.pharmacies.find(p => p.email && p.email.toLowerCase() === email);
  if (matchingBranch) {
    executeLogin("pharmacy", matchingBranch.id, matchingBranch.name);
    return;
  }

  // Fallback
  executeLogin("admin", null, NearPillData.adminCredentials.name);
}

function quickDemoLogin(type) {
  if (type === "admin") {
    executeLogin("admin", null, "Central Ops Admin");
  } else {
    const branch = NearPillData.pharmacies.find(p => p.slug === type || p.id === type);
    if (branch) {
      executeLogin("pharmacy", branch.id, branch.name);
    } else {
      executeLogin("pharmacy", "PH-001", "Mercury Drug BGC");
    }
  }
}

function executeLogin(role, branchId, userDisplayName) {
  currentRole = role;
  if (branchId) activeBranchId = branchId;
  activeTab = role === "admin" ? "dashboard" : "rx-queue";

  const session = {
    role: role,
    branchId: branchId,
    name: userDisplayName,
    loginTime: new Date().toISOString()
  };

  localStorage.setItem("nearpill_session", JSON.stringify(session));
  hideLoginOverlay();
  updateSidebarNav();
  renderCurrentView();
  showToast(`Authenticated successfully as ${userDisplayName}!`, "success");
}

function logoutSession() {
  localStorage.removeItem("nearpill_session");
  showLoginOverlay();
  showToast("Logged out successfully.", "info");
}

function togglePasswordVisibility(inputId, iconEl) {
  const input = document.getElementById(inputId);
  if (input) {
    if (input.type === "password") {
      input.type = "text";
      iconEl.classList.remove("fa-eye");
      iconEl.classList.add("fa-eye-slash");
    } else {
      input.type = "password";
      iconEl.classList.remove("fa-eye-slash");
      iconEl.classList.add("fa-eye");
    }
  }
}

function updateSidebarNav() {
  const navContainer = document.getElementById("sidebarNav");
  const userAvatar = document.getElementById("userAvatarText");
  const userName = document.getElementById("userNameText");
  const userRole = document.getElementById("userRoleText");
  const workspaceBadge = document.getElementById("workspaceBadgeText");

  if (currentRole === "admin") {
    if (userAvatar) userAvatar.innerText = "NP";
    if (userName) userName.innerText = "Platform Admin";
    if (userRole) userRole.innerText = "Central Operations";
    if (workspaceBadge) workspaceBadge.innerText = "Platform Operations";

    navContainer.innerHTML = `
      <div class="nav-section-title">CENTRAL PLATFORM ADMIN</div>
      <a class="nav-item ${activeTab === 'dashboard' ? 'active' : ''}" onclick="switchTab('dashboard')">
        <i class="fa-solid fa-chart-line"></i> Dashboard & Analytics
      </a>
      <a class="nav-item ${activeTab === 'pharmacies' ? 'active' : ''}" onclick="switchTab('pharmacies')">
        <i class="fa-solid fa-store"></i> Partner Pharmacies
      </a>
      <a class="nav-item ${activeTab === 'global-orders' ? 'active' : ''}" onclick="switchTab('global-orders')">
        <i class="fa-solid fa-box"></i> Global Order Monitor
      </a>
      <a class="nav-item ${activeTab === 'master-catalog' ? 'active' : ''}" onclick="switchTab('master-catalog')">
        <i class="fa-solid fa-capsules"></i> Standard Medicine Catalog
      </a>
    `;
  } else {
    const branch = NearPillData.pharmacies.find(p => p.id === activeBranchId) || NearPillData.pharmacies[0];
    if (userAvatar) userAvatar.innerText = branch.name.substring(0, 2).toUpperCase();
    if (userName) userName.innerText = branch.name;
    if (userRole) userRole.innerText = "Branch Pharmacy Staff";
    if (workspaceBadge) workspaceBadge.innerText = branch.name;

    const dal = CoreDB.getTenantContext(activeBranchId, currentRole);
    const pendingRxCount = dal.getPendingRxQueue().length;

    navContainer.innerHTML = `
      <div class="nav-section-title">BRANCH PHARMACY WORKSPACE</div>
      <a class="nav-item ${activeTab === 'rx-queue' ? 'active' : ''}" onclick="switchTab('rx-queue')">
        <i class="fa-solid fa-file-prescription"></i> Rx Verification
        ${pendingRxCount > 0 ? `<span class="badge badge-amber">${pendingRxCount}</span>` : ''}
      </a>
      <a class="nav-item ${activeTab === 'branch-fulfillment' ? 'active' : ''}" onclick="switchTab('branch-fulfillment')">
        <i class="fa-solid fa-boxes-packing"></i> Order Fulfillment
      </a>
      <a class="nav-item ${activeTab === 'branch-inventory' ? 'active' : ''}" onclick="switchTab('branch-inventory')">
        <i class="fa-solid fa-boxes-stacked"></i> Branch Inventory
      </a>
      <a class="nav-item ${activeTab === 'branch-analytics' ? 'active' : ''}" onclick="switchTab('branch-analytics')">
        <i class="fa-solid fa-chart-pie"></i> Branch Sales & Reports
      </a>
    `;
  }
}

function switchTab(tabId) {
  activeTab = tabId;
  updateSidebarNav();
  renderCurrentView();
}

async function renderCurrentView() {
  const container = document.getElementById("mainViewContainer");
  const titleEl = document.getElementById("currentPageTitle");

  if (!container) return;

  if (currentRole === "admin") {
    switch (activeTab) {
      case "dashboard":
        if (titleEl) titleEl.innerText = "Executive Dashboard & Platform Analytics";
        await renderAdminDashboardView(container);
        break;
      case "pharmacies":
        if (titleEl) titleEl.innerText = "Partner Pharmacy Management";
        await renderPharmaciesView(container);
        break;
      case "global-orders":
        if (titleEl) titleEl.innerText = "Global Platform Order Monitor";
        await renderGlobalOrdersView(container);
        break;
      case "master-catalog":
        if (titleEl) titleEl.innerText = "Standard Master Medicine Catalog";
        await renderMasterCatalogView(container);
        break;
      default:
        await renderAdminDashboardView(container);
    }
  } else {
    switch (activeTab) {
      case "rx-queue":
        if (titleEl) titleEl.innerText = "Prescription Verification Queue";
        await renderRxQueueView(container);
        break;
      case "branch-fulfillment":
        if (titleEl) titleEl.innerText = "Branch Order Packing Queue";
        await renderBranchFulfillmentView(container);
        break;
      case "branch-inventory":
        if (titleEl) titleEl.innerText = "Local Branch Inventory & Shelf Stock";
        await renderBranchInventoryView(container);
        break;
      case "branch-analytics":
        if (titleEl) titleEl.innerText = "Branch Gross Revenue & Dispensing Analytics";
        await renderBranchAnalyticsView(container);
        break;
      default:
        await renderRxQueueView(container);
    }
  }
}

/* Central Admin View Renderers */
async function renderAdminDashboardView(container) {
  const metrics = await NearPillAPI.getMetrics();

  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-title">TOTAL PLATFORM GMV</span>
          <div class="stat-icon-wrapper icon-mint"><i class="fa-solid fa-peso-sign"></i></div>
        </div>
        <div class="stat-value">₱${(metrics.totalGmv || 0).toLocaleString()}</div>
        <div class="stat-footer trend-up"><i class="fa-solid fa-arrow-trend-up"></i> +14.8% from last week</div>
      </div>

      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-title">ACTIVE PARTNER PHARMACIES</span>
          <div class="stat-icon-wrapper icon-blue"><i class="fa-solid fa-store"></i></div>
        </div>
        <div class="stat-value">${metrics.activePharmacies || 0} Branches</div>
        <div class="stat-footer"><span class="trend-up">100% verified</span> network</div>
      </div>

      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-title">COMPLETED ORDERS</span>
          <div class="stat-icon-wrapper icon-purple"><i class="fa-solid fa-circle-check"></i></div>
        </div>
        <div class="stat-value">${(metrics.completedOrders || 0).toLocaleString()}</div>
        <div class="stat-footer trend-up"><i class="fa-solid fa-truck"></i> 99.4% on-time delivery</div>
      </div>

      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-title">PENDING RX VERIFICATIONS</span>
          <div class="stat-icon-wrapper icon-amber"><i class="fa-solid fa-file-prescription"></i></div>
        </div>
        <div class="stat-value">${metrics.pendingRx || 0} Orders</div>
        <div class="stat-footer" style="color: var(--color-amber-text);"><i class="fa-solid fa-clock"></i> Requires pharmacist audit</div>
      </div>
    </div>

    <div class="dashboard-grid">
      <div class="card-box">
        <div class="section-header">
          <div>
            <div class="section-title">Weekly Platform Revenue (GMV Trend)</div>
            <div class="section-subtitle">Real-time prescription sales transaction graph</div>
          </div>
        </div>
        <div class="chart-container">
          <canvas id="gmvChartCanvas"></canvas>
        </div>
      </div>

      <div class="card-box">
        <div class="section-header">
          <div>
            <div class="section-title">Top Drugstore Leaderboard</div>
            <div class="section-subtitle">Revenue distribution by chain</div>
          </div>
        </div>
        <div class="chart-container">
          <canvas id="leaderboardChartCanvas"></canvas>
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    initGMVChart("gmvChartCanvas");
    initLeaderboardChart("leaderboardChartCanvas");
  }, 50);
}

async function renderPharmaciesView(container) {
  const pharmacies = await NearPillAPI.getPharmacies();

  container.innerHTML = `
    <div class="card-box">
      <div class="section-header">
        <div>
          <div class="section-title">Onboarded Drugstore Network (${pharmacies.length})</div>
          <div class="section-subtitle">Manage FDA-licensed pharmacy partners</div>
        </div>
        <button class="btn btn-primary" onclick="openAddPharmacyModal()">
          <i class="fa-solid fa-plus"></i> Onboard New Partner
        </button>
      </div>

      <div class="table-responsive">
        <table class="custom-table">
          <thead>
            <tr>
              <th>Drugstore Chain & Branch</th>
              <th>FDA License</th>
              <th>Branch Manager</th>
              <th>URL Slug</th>
              <th>Status</th>
              <th>Total Revenue</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${pharmacies.map(p => `
              <tr>
                <td>
                  <strong style="color: var(--color-primary-dark);">${p.name || p.fullName}</strong><br>
                  <span style="font-size: 11px; color: var(--color-text-muted);">${p.address || 'Metro Manila Branch'}</span>
                </td>
                <td><code>${p.licenseNo || 'FDA-PH-ACTIVE'}</code></td>
                <td>${p.manager || 'RPh Pharmacist'}</td>
                <td><code>#${p.slug || p.id}</code></td>
                <td>
                  <span class="status-badge ${p.status === 'active' ? 'badge-active' : 'badge-pending'}">
                    <i class="fa-solid fa-circle" style="font-size: 6px;"></i> ${p.status === 'active' ? 'Active Partner' : 'Pending Review'}
                  </span>
                </td>
                <td><strong>₱${(p.totalSales || 0).toLocaleString()}</strong></td>
                <td>
                  ${p.status === 'pending_review' ? `
                    <button class="btn btn-primary btn-sm" onclick="approvePharmacy('${p.id}')">
                      <i class="fa-solid fa-check"></i> Approve
                    </button>
                  ` : `
                    <button class="btn btn-outline btn-sm" onclick="quickDemoLogin('${p.slug || p.id}')">
                      <i class="fa-solid fa-right-to-bracket"></i> Login as Branch
                    </button>
                  `}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function renderGlobalOrdersView(container) {
  const orders = await NearPillAPI.getOrders(null, "admin");

  container.innerHTML = `
    <div class="card-box">
      <div class="section-header">
        <div>
          <div class="section-title">Platform Order Ledger (${orders.length})</div>
          <div class="section-subtitle">Real-time order feed across all partner drugstores</div>
        </div>
      </div>

      <div class="table-responsive">
        <table class="custom-table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Customer</th>
              <th>Assigned Drugstore</th>
              <th>Items Purchased</th>
              <th>Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${orders.map(o => `
              <tr>
                <td><strong>${o.id}</strong></td>
                <td>
                  <strong>${o.customerName || 'Customer'}</strong><br>
                  <span style="font-size: 11px; color: var(--color-text-muted);">${o.customerPhone || ''}</span>
                </td>
                <td>${o.pharmacyName || 'Assigned Branch'}</td>
                <td>
                  ${(o.items || []).map(i => `${i.brandName || i.name} (x${i.qty || 1})`).join(', ') || 'Medication items'}
                </td>
                <td><strong>₱${(o.totalAmount || o.total || 0).toFixed(2)}</strong></td>
                <td>
                  <span class="status-badge badge-${(o.status || 'pending').replace(/_/g, '-')}">
                    ${(o.status || 'pending').replace(/_/g, ' ')}
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function renderMasterCatalogView(container) {
  const catalog = await NearPillAPI.getMasterCatalog();

  container.innerHTML = `
    <div class="card-box">
      <div class="section-header">
        <div>
          <div class="section-title">FDA Standard Medication Catalog (${catalog.length})</div>
          <div class="section-subtitle">Central standard master listing available to all partner drugstores</div>
        </div>
        <button class="btn btn-primary" onclick="openAddMedicineModal()">
          <i class="fa-solid fa-plus"></i> Add Master Medication
        </button>
      </div>

      <div class="table-responsive">
        <table class="custom-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Brand Name</th>
              <th>Generic Composition</th>
              <th>Category</th>
              <th>Form</th>
              <th>Rx Requirement</th>
              <th>Standard Price</th>
            </tr>
          </thead>
          <tbody>
            ${catalog.map(m => `
              <tr>
                <td><code>${m.id}</code></td>
                <td><strong style="color: var(--color-primary-dark);">${m.brandName}</strong></td>
                <td><em>${m.genericName}</em></td>
                <td>${m.category}</td>
                <td>${m.dosageForm}</td>
                <td>
                  <span class="status-badge ${m.requiresRx ? 'badge-rx-verification' : 'badge-active'}">
                    ${m.requiresRx ? 'Prescription Required (Rx)' : 'Over The Counter (OTC)'}
                  </span>
                </td>
                <td><strong>₱${m.basePrice.toFixed(2)}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/* Branch Staff View Renderers */
function renderRxQueueView(container) {
  const dal = CoreDB.getTenantContext(activeBranchId, currentRole);
  const pendingRxOrders = dal.getPendingRxQueue();

  container.innerHTML = `
    <div class="card-box">
      <div class="section-header">
        <div>
          <div class="section-title">Prescription Audit Queue (${pendingRxOrders.length})</div>
          <div class="section-subtitle">Inspect uploaded Rx notes and verify doctor credentials</div>
        </div>
      </div>

      ${pendingRxOrders.length === 0 ? `
        <div style="padding: 40px; text-align: center; color: var(--color-text-muted);">
          <i class="fa-solid fa-circle-check" style="font-size: 48px; color: var(--color-primary); margin-bottom: 12px;"></i>
          <h3>All Prescriptions Verified!</h3>
          <p>No pending prescription verification requests in your branch queue.</p>
        </div>
      ` : `
        <div class="table-responsive">
          <table class="custom-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Patient Name</th>
                <th>Prescribed Medication</th>
                <th>Doctor & PRC License</th>
                <th>Rx Document</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${pendingRxOrders.map(o => `
                <tr>
                  <td><strong>${o.id}</strong></td>
                  <td>
                    <strong>${o.rxPrescription.patientName}</strong> (${o.rxPrescription.patientAge} y/o)<br>
                    <span style="font-size: 11px; color: var(--color-text-muted);">Dx: ${o.rxPrescription.diagnosis}</span>
                  </td>
                  <td>${o.rxPrescription.medicationScript}</td>
                  <td>
                    <strong>${o.rxPrescription.doctorName}</strong><br>
                    <code>${o.rxPrescription.prcLicense}</code>
                  </td>
                  <td>
                    <div class="rx-thumbnail" onclick="openRxViewerModal('${o.id}')" title="Click to view Prescription Paper">
                      <i class="fa-solid fa-file-prescription"></i>
                    </div>
                  </td>
                  <td>
                    <button class="btn btn-primary btn-sm" onclick="openRxViewerModal('${o.id}')">
                      <i class="fa-solid fa-magnifying-glass"></i> Inspect & Verify
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

function renderBranchFulfillmentView(container) {
  const dal = CoreDB.getTenantContext(activeBranchId, currentRole);
  const orders = dal.getOrders().filter(o => o.status !== "rx_verification");

  container.innerHTML = `
    <div class="card-box">
      <div class="section-header">
        <div>
          <div class="section-title">Branch Order Packing Queue (${orders.length})</div>
          <div class="section-subtitle">Pack medication items and signal completion</div>
        </div>
      </div>

      <div class="table-responsive">
        <table class="custom-table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Customer</th>
              <th>Items to Pack</th>
              <th>Total</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${orders.map(o => `
              <tr>
                <td><strong>${o.id}</strong></td>
                <td>
                  <strong>${o.customerName}</strong><br>
                  <span style="font-size: 11px; color: var(--color-text-muted);">${o.customerPhone}</span>
                </td>
                <td>${o.items.map(i => `• ${i.brandName} (x${i.qty})`).join('<br>')}</td>
                <td><strong>₱${o.totalAmount.toFixed(2)}</strong></td>
                <td>
                  <span class="status-badge badge-${o.status.replace(/_/g, '-')}">
                    ${o.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td>
                  ${o.status === 'preparing' ? `
                    <button class="btn btn-primary btn-sm" onclick="markOrderReady('${o.id}')">
                      <i class="fa-solid fa-box-archive"></i> Mark Ready for Pickup
                    </button>
                  ` : `
                    <span style="font-size: 12px; color: var(--color-primary-dark); font-weight: 600;">
                      <i class="fa-solid fa-check"></i> Packaged
                    </span>
                  `}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderBranchInventoryView(container) {
  const dal = CoreDB.getTenantContext(activeBranchId, currentRole);
  const inventory = dal.getInventory();

  container.innerHTML = `
    <div class="card-box">
      <div class="section-header">
        <div>
          <div class="section-title">Branch Shelf Inventory (${inventory.length} SKUs)</div>
          <div class="section-subtitle">Real-time branch stock level management</div>
        </div>
      </div>

      <div class="table-responsive">
        <table class="custom-table">
          <thead>
            <tr>
              <th>Medication Brand</th>
              <th>Stock Level</th>
              <th>Stock Status</th>
              <th>Unit Price</th>
              <th>Quick Restock</th>
            </tr>
          </thead>
          <tbody>
            ${inventory.map(item => `
              <tr>
                <td><strong style="color: var(--color-primary-dark);">${item.brandName}</strong></td>
                <td><strong>${item.stock} units</strong></td>
                <td>
                  ${item.stock <= item.alertThreshold ? `
                    <span class="status-badge badge-pending">
                      <i class="fa-solid fa-triangle-exclamation"></i> Low Stock Alert (<${item.alertThreshold})
                    </span>
                  ` : `
                    <span class="status-badge badge-active">
                      <i class="fa-solid fa-check"></i> In Stock
                    </span>
                  `}
                </td>
                <td>₱${item.price.toFixed(2)}</td>
                <td>
                  <button class="btn btn-secondary btn-sm" onclick="updateStockCount('${item.medId}', 50)">
                    <i class="fa-solid fa-plus"></i> +50 Restock
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderBranchAnalyticsView(container) {
  const branch = NearPillData.pharmacies.find(p => p.id === activeBranchId) || NearPillData.pharmacies[0];

  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-title">BRANCH GROSS SALES</div>
        <div class="stat-value">₱${branch.totalSales.toLocaleString()}</div>
        <div class="stat-footer trend-up"><i class="fa-solid fa-arrow-trend-up"></i> Top branch performer</div>
      </div>

      <div class="stat-card">
        <div class="stat-title">FULFILLED ORDERS</div>
        <div class="stat-value">${branch.totalOrders}</div>
        <div class="stat-footer"><span class="trend-up">100% Rx Compliance</span></div>
      </div>

      <div class="stat-card">
        <div class="stat-title">PATIENT RATING</div>
        <div class="stat-value">★ ${branch.rating} / 5.0</div>
        <div class="stat-footer trend-up"><i class="fa-solid fa-heart"></i> Excellent feedback</div>
      </div>
    </div>

    <div class="card-box">
      <div class="section-header">
        <div>
          <div class="section-title">Most Frequently Dispensed Medications</div>
          <div class="section-subtitle">Branch medication demand chart</div>
        </div>
      </div>
      <div class="chart-container">
        <canvas id="topMedsChartCanvas"></canvas>
      </div>
    </div>
  `;

  setTimeout(() => {
    initTopMedicinesChart("topMedsChartCanvas");
  }, 50);
}

/* Modals & Dialog Actions */
function openRxViewerModal(orderId) {
  const dal = CoreDB.getTenantContext(activeBranchId, currentRole);
  const order = dal.getOrders().find(o => o.id === orderId);

  if (!order || !order.rxPrescription) return;
  const rx = order.rxPrescription;

  const modalHtml = `
    <div class="modal-overlay active" id="rxModal">
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title">
            <i class="fa-solid fa-file-prescription"></i> Prescription Review & Verification
          </div>
          <button class="modal-close" onclick="closeModal('rxModal')"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <div class="rx-viewer-container">
            <div class="rx-doc-paper">
              <div class="rx-header-stamp">
                <div class="rx-doctor-name">${rx.doctorName}</div>
                <div class="rx-doctor-sub">${rx.clinicName} • License: ${rx.prcLicense}</div>
              </div>
              <div style="font-size: 11px; color: var(--color-text-muted);">
                Patient: <strong>${rx.patientName}</strong> (${rx.patientAge} y/o)
              </div>
              <div class="rx-symbol">℞</div>
              <div class="rx-script-items">
                <strong>Medication Script:</strong><br>
                ${rx.medicationScript}
              </div>
              ${rx.warnings ? `
                <div style="font-size: 11px; color: var(--color-amber-text); background-color: var(--color-amber-bg); padding: 8px; border-radius: 4px; margin-bottom: 8px;">
                  <i class="fa-solid fa-circle-exclamation"></i> ${rx.warnings}
                </div>
              ` : ''}
              <div class="rx-signature">${rx.doctorName}</div>
            </div>

            <div style="display: flex; flex-direction: column; justify-content: space-between;">
              <div>
                <h4 style="color: var(--color-primary-dark); margin-bottom: 10px;">Clinical Safety Checklist</h4>
                <ul style="font-size: 12px; color: var(--color-text-muted); display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px;">
                  <li><i class="fa-solid fa-square-check" style="color: var(--color-primary);"></i> Doctor PRC License is valid</li>
                  <li><i class="fa-solid fa-square-check" style="color: var(--color-primary);"></i> Patient name matches account name</li>
                  <li><i class="fa-solid fa-square-check" style="color: var(--color-primary);"></i> Dosage format complies with FDA guidelines</li>
                </ul>
              </div>

              <div style="display: flex; flex-direction: column; gap: 10px;">
                <button class="btn btn-primary" onclick="approveRxPrescription('${order.id}')">
                  <i class="fa-solid fa-circle-check"></i> Approve Prescription & Dispense
                </button>
                <button class="btn btn-danger" onclick="rejectRxPrescription('${order.id}')">
                  <i class="fa-solid fa-circle-xmark"></i> Reject Prescription
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.remove();
}

async function approveRxPrescription(orderId) {
  try {
    await NearPillAPI.approvePrescription(orderId, activeBranchId, currentRole);
    
    TenantEventEngine.emit(TenantEvents.RX_VERIFICATION_COMPLETE, {
      orderId: orderId,
      approved: true,
      timestamp: new Date().toISOString()
    });

    closeModal('rxModal');
    renderCurrentView();
    showToast(`Prescription for ${orderId} APPROVED!`, "success");
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function rejectRxPrescription(orderId) {
  try {
    await NearPillAPI.rejectPrescription(orderId, activeBranchId, currentRole);

    TenantEventEngine.emit(TenantEvents.RX_VERIFICATION_COMPLETE, {
      orderId: orderId,
      approved: false,
      timestamp: new Date().toISOString()
    });

    closeModal('rxModal');
    renderCurrentView();
    showToast(`Prescription for ${orderId} REJECTED.`, "amber");
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function updateStockCount(medId, count) {
  try {
    await NearPillAPI.updateStock(medId, count, activeBranchId, currentRole);

    TenantEventEngine.emit(TenantEvents.STOCK_RESTOCKED, {
      tenantId: activeBranchId,
      medId: medId,
      addedQty: count
    });

    renderCurrentView();
    showToast(`Stock updated: +${count} units added.`, "success");
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function markOrderReady(orderId) {
  try {
    await NearPillAPI.markOrderReady(orderId, activeBranchId, currentRole);

    TenantEventEngine.emit(TenantEvents.ORDER_STATUS_CHANGED, {
      orderId: orderId,
      newStatus: "ready_for_pickup"
    });

    renderCurrentView();
    showToast(`Order ${orderId} marked Ready for Pickup!`, "success");
  } catch (e) {
    showToast(e.message, "error");
  }
}

function openAddPharmacyModal() {
  const modalHtml = `
    <div class="modal-overlay active" id="addPharmacyModal">
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title"><i class="fa-solid fa-store"></i> Onboard Partner Drugstore</div>
          <button class="modal-close" onclick="closeModal('addPharmacyModal')"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Drugstore Chain & Branch Name</label>
            <input type="text" id="newPharmName" class="filter-select" style="width:100%" placeholder="e.g. Mercury Drug - Fairview">
          </div>
          <div class="form-group">
            <label class="form-label">FDA Operating License Number</label>
            <input type="text" id="newPharmLicense" class="filter-select" style="width:100%" placeholder="FDA-PH-XXXXXX">
          </div>
          <div class="form-group">
            <label class="form-label">URL Slug</label>
            <input type="text" id="newPharmSlug" class="filter-select" style="width:100%" placeholder="e.g. mercury-drug-fairview">
          </div>
          <button class="btn btn-primary" style="width:100%" onclick="saveNewPharmacy()">
            Onboard Drugstore Branch
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function saveNewPharmacy() {
  const name = document.getElementById("newPharmName").value.trim();
  const license = document.getElementById("newPharmLicense").value.trim();
  const slug = document.getElementById("newPharmSlug").value.trim() || name.toLowerCase().replace(/[^a-z0-9]/g, '-');

  if (!name || !license) {
    showToast("Please complete all pharmacy details.", "amber");
    return;
  }

  CoreDB.PharmacyRegistry.register({
    name: name,
    licenseNo: license,
    slug: slug,
    address: "Metro Manila Branch",
    manager: "Pharmacist-in-Charge, RPh",
    email: `${slug}@pharmacy.ph`,
    password: "pass123"
  });

  closeModal('addPharmacyModal');
  renderCurrentView();
  showToast(`Onboarded ${name} successfully!`, "success");
}

function approvePharmacy(pharmacyId) {
  CoreDB.PharmacyRegistry.activate(pharmacyId);
  renderCurrentView();
  showToast("Pharmacy branch activated successfully!", "success");
}

function openAddMedicineModal() {
  const modalHtml = `
    <div class="modal-overlay active" id="addMedicineModal">
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title"><i class="fa-solid fa-capsules"></i> Add Master Medication</div>
          <button class="modal-close" onclick="closeModal('addMedicineModal')"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Brand Name</label>
            <input type="text" id="newMedBrand" class="filter-select" style="width:100%" placeholder="e.g. Medicol Advance">
          </div>
          <div class="form-group">
            <label class="form-label">Generic Composition</label>
            <input type="text" id="newMedGeneric" class="filter-select" style="width:100%" placeholder="Ibuprofen 200mg">
          </div>
          <div class="form-group">
            <label class="form-label">Standard Price (₱)</label>
            <input type="number" step="0.25" id="newMedPrice" class="filter-select" style="width:100%" placeholder="8.50">
          </div>
          <button class="btn btn-primary" style="width:100%" onclick="saveNewMedicine()">
            Add to Master Catalog
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function saveNewMedicine() {
  const brand = document.getElementById("newMedBrand").value.trim();
  const generic = document.getElementById("newMedGeneric").value.trim();
  const price = parseFloat(document.getElementById("newMedPrice").value) || 10.0;

  if (!brand || !generic) {
    showToast("Please fill in medication details.", "amber");
    return;
  }

  CoreDB.MasterCatalog.addMedication({
    brandName: brand,
    genericName: generic,
    category: "General Pharmacy",
    dosageForm: "Tablet",
    requiresRx: false,
    basePrice: price,
    manufacturer: "Unilab"
  });

  closeModal('addMedicineModal');
  renderCurrentView();
  showToast(`Added ${brand} to standard catalog.`, "success");
}

function showToast(message, type = "success") {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : (type === 'amber' ? 'fa-triangle-exclamation' : 'fa-circle-exclamation')}" style="color: ${type === 'success' ? 'var(--color-primary)' : (type === 'amber' ? 'var(--color-amber)' : 'var(--color-red)')};"></i>
    <div style="font-size: 13px; font-weight: 500;">${message}</div>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3500);
}
