/* NearPill Decoupled Multi-Tenant Shared Database Core & Security DAL */

class TenantIsolationError extends Error {
  constructor(message) {
    super(message);
    this.name = "TenantIsolationError";
  }
}

class SharedMasterCatalogStore {
  constructor(data) {
    this._catalog = data.masterCatalog;
  }

  getAll() {
    return [...this._catalog];
  }

  getById(medId) {
    return this._catalog.find(m => m.id === medId);
  }

  addMedication(medItem) {
    const newId = `MED-00${this._catalog.length + 1}`;
    const newItem = { id: newId, ...medItem };
    this._catalog.push(newItem);
    return newItem;
  }
}

class SharedPharmacyTenantRegistry {
  constructor(data) {
    this._pharmacies = data.pharmacies;
  }

  getAll() {
    return [...this._pharmacies];
  }

  getById(tenantId) {
    return this._pharmacies.find(p => p.id === tenantId || p.slug === tenantId);
  }

  register(tenantData) {
    const newId = `PH-00${this._pharmacies.length + 1}`;
    const newTenant = {
      id: newId,
      status: "pending_review",
      rating: 5.0,
      totalOrders: 0,
      totalSales: 0,
      ...tenantData
    };
    this._pharmacies.push(newTenant);
    return newTenant;
  }

  activate(tenantId) {
    const tenant = this.getById(tenantId);
    if (tenant) {
      tenant.status = "active";
      return true;
    }
    return false;
  }
}

class SharedGlobalOrderLedger {
  constructor(data) {
    this._orders = data.orders;
  }

  getAll() {
    return [...this._orders];
  }

  getByTenant(tenantId) {
    return this._orders.filter(o => o.pharmacyId === tenantId);
  }

  getById(orderId) {
    return this._orders.find(o => o.id === orderId);
  }

  updateStatus(orderId, newStatus) {
    const order = this.getById(orderId);
    if (order) {
      order.status = newStatus;
      return order;
    }
    return null;
  }

  approveRx(orderId) {
    const order = this.getById(orderId);
    if (order && order.rxPrescription) {
      order.rxPrescription.approved = true;
      order.status = "preparing";
      return order;
    }
    return null;
  }

  rejectRx(orderId) {
    const order = this.getById(orderId);
    if (order && order.rxPrescription) {
      order.rxPrescription.approved = false;
      order.status = "cancelled";
      return order;
    }
    return null;
  }
}

class NearPillSharedCoreDB {
  constructor(data) {
    this.MasterCatalog = new SharedMasterCatalogStore(data);
    this.PharmacyRegistry = new SharedPharmacyTenantRegistry(data);
    this.GlobalOrders = new SharedGlobalOrderLedger(data);
    this._branchInventory = data.branchInventory;
  }

  getTenantContext(tenantId, requestingRole) {
    return {
      tenantId: tenantId,
      role: requestingRole,

      getInventory: () => {
        if (requestingRole !== "admin" && tenantId) {
          return this._branchInventory[tenantId] || [];
        }
        return this._branchInventory;
      },

      updateStock: (medId, delta) => {
        if (requestingRole !== "admin" && !tenantId) {
          throw new TenantIsolationError("Unauthorized tenant inventory mutation attempt.");
        }
        const inv = this._branchInventory[tenantId];
        if (inv) {
          const item = inv.find(i => i.medId === medId);
          if (item) {
            item.stock += delta;
            return item;
          }
        }
        return null;
      },

      getOrders: () => {
        if (requestingRole === "admin") {
          return this.GlobalOrders.getAll();
        }
        return this.GlobalOrders.getByTenant(tenantId);
      },

      getPendingRxQueue: () => {
        const orders = requestingRole === "admin" ? this.GlobalOrders.getAll() : this.GlobalOrders.getByTenant(tenantId);
        return orders.filter(o => o.status === "rx_verification");
      },

      approvePrescription: (orderId) => {
        const order = this.GlobalOrders.getById(orderId);
        if (!order) return null;
        if (requestingRole !== "admin" && order.pharmacyId !== tenantId) {
          throw new TenantIsolationError(`Tenant ${tenantId} cannot mutate order belonging to ${order.pharmacyId}`);
        }
        return this.GlobalOrders.approveRx(orderId);
      },

      rejectPrescription: (orderId) => {
        const order = this.GlobalOrders.getById(orderId);
        if (!order) return null;
        if (requestingRole !== "admin" && order.pharmacyId !== tenantId) {
          throw new TenantIsolationError(`Tenant ${tenantId} cannot mutate order belonging to ${order.pharmacyId}`);
        }
        return this.GlobalOrders.rejectRx(orderId);
      },

      markOrderPackaged: (orderId) => {
        const order = this.GlobalOrders.getById(orderId);
        if (!order) return null;
        if (requestingRole !== "admin" && order.pharmacyId !== tenantId) {
          throw new TenantIsolationError(`Tenant ${tenantId} cannot modify fulfillment for ${order.pharmacyId}`);
        }
        return this.GlobalOrders.updateStatus(orderId, "ready_for_pickup");
      }
    };
  }

  getGlobalMetrics() {
    const orders = this.GlobalOrders.getAll();
    const totalGmv = orders.reduce((sum, o) => sum + o.totalAmount, 0);
    const completedOrders = orders.filter(o => o.status === "delivered").length;
    const pendingRx = orders.filter(o => o.status === "rx_verification").length;
    const activePharmacies = this.PharmacyRegistry.getAll().filter(p => p.status === "active").length;

    return {
      totalGmv: totalGmv + 1410000,
      completedOrders: completedOrders + 3840,
      pendingRx: pendingRx,
      activePharmacies: activePharmacies
    };
  }
}

// Global Core DB Instance
window.CoreDB = new NearPillSharedCoreDB(NearPillData);
