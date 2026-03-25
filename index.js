const express = require('express');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// --- 1. HEALTH CHECK ---
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ 
        status: 'Faryal API Online', 
        db_time: result.rows[0].now,
        message: 'Luxury Bridal Engine Ready'
    });
  } catch (err) {
    res.status(500).json({ error: 'Database Connection Failed', details: err.message });
  }
});

// --- 2. INVENTORY ROUTES ---
app.post('/api/inventory', async (req, res) => {
    const { sku, model_name, designer, category, size_label, color, rental_price } = req.body;
    try {
        const query = `INSERT INTO inventory_units (sku, model_name, designer, category, size_label, color, rental_price) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;`;
        const result = await pool.query(query, [sku, model_name, designer, category, size_label, color, rental_price]);
        res.status(201).json({ message: 'Gown added', unit: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add gown', details: err.message });
    }
});

app.get('/api/inventory', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM inventory_units ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 3. CUSTOMER ROUTES ---
app.post('/api/customers', async (req, res) => {
    const { full_name, email, phone, wedding_date, bust_cm, waist_cm, hips_cm, shoe_size } = req.body;
    try {
        const query = `INSERT INTO customers (full_name, email, phone, wedding_date, bust_cm, waist_cm, hips_cm, shoe_size) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;`;
        const result = await pool.query(query, [full_name, email, phone, wedding_date, bust_cm, waist_cm, hips_cm, shoe_size]);
        res.status(201).json({ message: 'Customer profile created', customer: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create customer', details: err.message });
    }
});

// --- 4. BOOKING ENGINE (With 3-Day Buffer Logic) ---
app.post('/api/bookings', async (req, res) => {
    const { customer_id, inventory_unit_id, start_date, end_date, total_fee } = req.body;
    try {
        const bufferQuery = `SELECT ($1::date + INTERVAL '3 days')::date AS buffer_end`;
        const bufferRes = await pool.query(bufferQuery, [end_date]);
        const buffer_end_date = bufferRes.rows[0].buffer_end;

        const query = `
            INSERT INTO bookings (customer_id, inventory_unit_id, start_date, end_date, buffer_end_date, total_fee)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *;
        `;
        const values = [customer_id, inventory_unit_id, start_date, end_date, buffer_end_date, total_fee];
        const result = await pool.query(query, values);
        
        res.status(201).json({ message: 'Booking confirmed', booking: result.rows[0] });
    } catch (err) {
        res.status(400).json({ error: 'Booking Conflict', details: err.message });
    }
});

app.listen(PORT, () => {
  console.log(`--- FARYAL AL HOSARY ---`);
  console.log(`Server running on http://localhost:${PORT}`);
});
