/* NearPill Admin Portal - Database Synced Data Model */
const NearPillData = {
  adminCredentials: {
    email: "admin@nearpill.com",
    password: "admin123",
    name: "Central Operations Admin"
  },

  pharmacies: [
    {
      id: "PH-001",
      slug: "medplus-drugstore",
      name: "MedPlus Drugstore",
      licenseNo: "FDA-PH-2024-001",
      address: "Colon Street, Cebu City, Cebu, Philippines",
      manager: "Pharm. Branch Staff, RPh",
      email: "medplus-drugstore@nearpill.ph",
      password: "pass123",
      status: "active",
      rating: 4.8,
      totalOrders: 5,
      totalSales: 288.50
    },
    {
      id: "PH-002",
      slug: "generika-drugstore",
      name: "Generika Drugstore",
      licenseNo: "FDA-PH-2024-002",
      address: "Osmeña Blvd, Cebu City, Cebu, Philippines",
      manager: "Pharm. Branch Staff, RPh",
      email: "generika-drugstore@nearpill.ph",
      password: "pass123",
      status: "active",
      rating: 4.8,
      totalOrders: 2,
      totalSales: 1127.25
    },
    {
      id: "PH-003",
      slug: "wellness-pharmacy",
      name: "Wellness Pharmacy",
      licenseNo: "FDA-PH-2024-003",
      address: "Banilad, Cebu City, Cebu, Philippines",
      manager: "Pharm. Branch Staff, RPh",
      email: "wellness-pharmacy@nearpill.ph",
      password: "pass123",
      status: "active",
      rating: 4.8,
      totalOrders: 1,
      totalSales: 980.00
    }
  ]
};
