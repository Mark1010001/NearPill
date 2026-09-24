import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Load variables from your local secure .env file
dotenv.config();

const schemaSQL = `
  CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(32) NULL,
    birthdate VARCHAR(32) NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('customer', 'admin', 'partner') NOT NULL DEFAULT 'customer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS drugstores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    address VARCHAR(255) NOT NULL,
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    operating_hours VARCHAR(255) NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS medicines (
    id INT AUTO_INCREMENT PRIMARY KEY,
    brand_name VARCHAR(100) NOT NULL,
    generic_name VARCHAR(100) NULL,
    dosage_form VARCHAR(50) DEFAULT 'Tablet',
    category VARCHAR(100) NULL,
    rx_required TINYINT(1) DEFAULT 0,
    description TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    drugstore_id INT NOT NULL,
    medicine_id INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    stock_count INT DEFAULT 0,
    availability TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (drugstore_id) REFERENCES drugstores(id) ON DELETE CASCADE,
    FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reference VARCHAR(64) NOT NULL UNIQUE,
    user_id INT NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    rejection_reason TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NULL,
    userId INT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS order_drugstores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    drugstore_id INT NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    rejection_reason TEXT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (drugstore_id) REFERENCES drugstores(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_drugstore_id INT NOT NULL,
    medicine_id INT NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (order_drugstore_id) REFERENCES order_drugstores(id) ON DELETE CASCADE,
    FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    action VARCHAR(100) NOT NULL,
    description TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(50) NULL,
    payment_status ENUM('pending', 'paid', 'refunded', 'failed') DEFAULT 'pending',
    payment_reference VARCHAR(100) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    drugstore_id INT NOT NULL,
    tier ENUM('Basic', 'Premium') NOT NULL,
    status ENUM('active', 'expired', 'cancelled') DEFAULT 'active',
    start_date DATE NOT NULL,
    end_date DATE NULL,
    FOREIGN KEY (drugstore_id) REFERENCES drugstores(id) ON DELETE CASCADE
  );
`;

async function initializeDatabase() {
  console.log('🏢 [Corporate Initializer] Connecting to MySQL Server...');
  
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      multipleStatements: true, // Allows processing all tables at once
    });

    console.log(`🚀 [Corporate Initializer] Syncing database layout: "${process.env.DB_NAME}"...`);
    await connection.query(schemaSQL);
    console.log('✅ [Corporate Initializer] All 10 tables synchronized successfully!');
    await connection.end();
    console.log('🔒 [Corporate Initializer] Connection closed clean.');
  } catch (error) {
    console.error('❌ [Corporate Initializer] Critical Error:', error.message);
  }
}

initializeDatabase();
