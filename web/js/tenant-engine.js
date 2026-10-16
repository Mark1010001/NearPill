/* NearPill Decoupled Multi-Tenant Event Pub/Sub Engine */

const TenantEvents = {
  ORDER_STATUS_CHANGED: "ORDER_STATUS_CHANGED",
  RX_VERIFICATION_COMPLETE: "RX_VERIFICATION_COMPLETE",
  STOCK_RESTOCKED: "STOCK_RESTOCKED",
  PHARMACY_ONBOARDED: "PHARMACY_ONBOARDED",
  PHARMACY_ACTIVATED: "PHARMACY_ACTIVATED",
  MEDICATION_ADDED: "MEDICATION_ADDED"
};

class NearPillTenantEventEngine {
  constructor() {
    this._subscribers = {};
    this._auditLog = [];
  }

  on(eventName, handler) {
    if (!this._subscribers[eventName]) {
      this._subscribers[eventName] = [];
    }
    this._subscribers[eventName].push(handler);
  }

  off(eventName, handler) {
    if (!this._subscribers[eventName]) return;
    this._subscribers[eventName] = this._subscribers[eventName].filter(h => h !== handler);
  }

  emit(eventName, payload) {
    const eventRecord = {
      eventId: `EVT-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      eventName: eventName,
      timestamp: new Date().toISOString(),
      payload: payload
    };

    this._auditLog.unshift(eventRecord);
    console.log('[TenantEventEngine] Event emitted');

    if (this._subscribers[eventName]) {
      this._subscribers[eventName].forEach(handler => {
        try {
          handler(payload, eventRecord);
        } catch (e) {
          console.error('[TenantEventEngine] Event handler failed');
        }
      });
    }
  }

  getAuditLog() {
    return [...this._auditLog];
  }
}

window.TenantEventEngine = new NearPillTenantEventEngine();

// Subscribe default decoupled loggers
TenantEventEngine.on(TenantEvents.RX_VERIFICATION_COMPLETE, (payload) => {
  console.log(`[Event Subscriber] Rx ${payload.orderId} status set to ${payload.approved ? 'APPROVED' : 'REJECTED'}`);
});

TenantEventEngine.on(TenantEvents.STOCK_RESTOCKED, (payload) => {
  console.log(`[Event Subscriber] Stock restocked for tenant ${payload.tenantId}: +${payload.addedQty}`);
});
