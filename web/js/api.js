/* NearPill API Client - Connected Directly to MySQL Backend (http://localhost:3001) */

const API_BASE_URL = "http://localhost:3001/api";

const NearPillAPI = {
  // 1. Fetch live platform metrics from backend database
  async getMetrics() {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/metrics`);
      if (res.ok) {
        const data = await res.json();
        return {
          totalGmv: data.totalGMV || 0,
          activePharmacies: data.activePharmaciesCount || 0,
          completedOrders: data.totalOrdersCount || 0,
          pendingRx: data.rxPendingVerificationCount || 0
        };
      }
    } catch (e) {
      console.error("Error fetching admin metrics from DB:", e);
    }
    return { totalGmv: 0, activePharmacies: 0, completedOrders: 0, pendingRx: 0 };
  },

  // 2. Fetch real partner pharmacies from MySQL database
  async getPharmacies() {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/pharmacies`);
      if (res.ok) {
        const data = await res.json();
        return data.map(p => ({
          id: p.id || `PH-00${p.store_id}`,
          store_id: p.store_id,
          slug: p.slug,
          name: p.name,
          address: p.address,
          email: p.email,
          licenseNo: p.licenseNo || "FDA-PH-2026-ACTIVE",
          manager: p.manager || "Branch Staff, RPh",
          status: (p.status || "Active").toLowerCase() === "active" ? "active" : "pending_review",
          rating: p.rating || "4.8",
          totalOrders: p.totalOrders || 0,
          totalSales: p.totalSales || 0
        }));
      }
    } catch (e) {
      console.error("Error fetching pharmacies from DB:", e);
    }
    return [];
  },

  // 3. Fetch real customer orders from MySQL database
  async getOrders(branchId = null, role = "admin") {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/orders`);
      if (res.ok) {
        const data = await res.json();
        let orders = data.map(o => ({
          id: o.reference || `NP-${o.id}`,
          rawId: o.id,
          customerName: o.customerName || "Customer",
          customerPhone: o.customerEmail || "",
          pharmacyName: o.storeName || "Partner Branch",
          pharmacyId: o.store_id ? `PH-00${o.store_id}` : null,
          items: typeof o.items === 'string' ? JSON.parse(o.items || '[]') : (o.items || []),
          totalAmount: parseFloat(String(o.total).replace(/[^0-9.]/g, '')) || 0,
          status: (o.stage || "placed").toLowerCase(),
          createdAt: o.placedOn
        }));

        if (branchId && role !== "admin") {
          orders = orders.filter(o => o.pharmacyId === branchId || o.pharmacyName.toLowerCase().includes(branchId.toLowerCase()));
        }
        return orders;
      }
    } catch (e) {
      console.error("Error fetching orders from DB:", e);
    }
    return [];
  },

  // 4. Fetch real medicines from master database catalog
  async getMasterCatalog() {
    try {
      const res = await fetch(`${API_BASE_URL}/medicines`);
      if (res.ok) {
        const data = await res.json();
        return data.map(m => ({
          id: `MED-00${m.id}`,
          brandName: m.name,
          genericName: m.genericName || m.name,
          category: m.category || "Prescription / OTC",
          dosageForm: m.dosage || "Tablet / Liquid",
          requiresRx: Boolean(m.requiresRx),
          basePrice: parseFloat(m.price) || 0,
          manufacturer: m.manufacturer || "FDA Approved Supplier"
        }));
      }
    } catch (e) {
      console.error("Error fetching medicines from DB:", e);
    }
    return [];
  },

  // 5. Approve Prescription in DB
  async approvePrescription(orderId) {
    try {
      const res = await fetch(`${API_BASE_URL}/orders/${orderId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" })
      });
      return await res.json();
    } catch (e) {
      console.error("Error approving prescription in DB:", e);
    }
  },

  // 6. Reject Prescription in DB
  async rejectPrescription(orderId) {
    try {
      const res = await fetch(`${API_BASE_URL}/orders/${orderId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" })
      });
      return await res.json();
    } catch (e) {
      console.error("Error rejecting prescription in DB:", e);
    }
  },

  // 7. Update Inventory Stock in DB
  async updateStock(medId, countDelta, branchId) {
    try {
      const res = await fetch(`${API_BASE_URL}/inventory/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pharmacyId: branchId, medId: medId, countDelta: countDelta })
      });
      return await res.json();
    } catch (e) {
      console.error("Error updating stock in DB:", e);
    }
  },

  // 8. Mark Order Ready for Pickup in DB
  async markOrderReady(orderId) {
    try {
      const res = await fetch(`${API_BASE_URL}/orders/${orderId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ready_for_pickup" })
      });
      return await res.json();
    } catch (e) {
      console.error("Error marking order ready in DB:", e);
    }
  }
};
