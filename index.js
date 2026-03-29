const express = require('express');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();

const app = express();

// --- CORS: Whitelist frontend origins ---
const allowedOrigins = [
    process.env.CORS_ORIGIN,
    'https://faryal-al-hosary.vercel.app',
    'http://localhost:5173',
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(null, true); // permissive for now, tighten in prod
        }
    },
    credentials: true,
}));
app.use(express.json());

const PORT = process.env.PORT || 3001;

// ============================================================
// 1. HEALTH CHECK
// ============================================================
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

// ============================================================
// 2. INVENTORY CRUD
// ============================================================

// GET all inventory
app.get('/api/inventory', async (req, res) => {
    try {
        const { search, category } = req.query;
        let query = 'SELECT * FROM inventory_units';
        const conditions = [];
        const params = [];

        if (search) {
            params.push(`%${search}%`);
            conditions.push(`(model_name ILIKE $${params.length} OR designer ILIKE $${params.length} OR sku ILIKE $${params.length})`);
        }
        if (category && category !== 'all') {
            params.push(category);
            conditions.push(`category = $${params.length}`);
        }

        if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
        query += ' ORDER BY id DESC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET single inventory item
app.get('/api/inventory/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM inventory_units WHERE id = $1', [req.params.id]);
        if (!result.rows.length) return res.status(404).json({ error: 'Gown not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST new inventory item
app.post('/api/inventory', async (req, res) => {
    const { sku, model_name, designer, category, size_label, color, rental_price } = req.body;
    try {
        const query = `INSERT INTO inventory_units (sku, model_name, designer, category, size_label, color, rental_price)
                   VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *;`;
        const result = await pool.query(query, [sku, model_name, designer, category, size_label, color, rental_price]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'SKU already exists' });
        res.status(500).json({ error: 'Failed to add gown', details: err.message });
    }
});

// PUT update inventory item
app.put('/api/inventory/:id', async (req, res) => {
    const { sku, model_name, designer, category, size_label, color, rental_price, current_status } = req.body;
    try {
        const query = `UPDATE inventory_units
                   SET sku=$1, model_name=$2, designer=$3, category=$4, size_label=$5, color=$6, rental_price=$7, current_status=COALESCE($8, current_status)
                   WHERE id=$9 RETURNING *;`;
        const result = await pool.query(query, [sku, model_name, designer, category, size_label, color, rental_price, current_status, req.params.id]);
        if (!result.rows.length) return res.status(404).json({ error: 'Gown not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update gown', details: err.message });
    }
});

// DELETE inventory item
app.delete('/api/inventory/:id', async (req, res) => {
    try {
        // Check for active bookings first
        const bookings = await pool.query(
            `SELECT id FROM bookings WHERE inventory_unit_id = $1 AND end_date >= CURRENT_DATE`,
            [req.params.id]
        );
        if (bookings.rows.length > 0) {
            return res.status(409).json({ error: 'Cannot delete — gown has active bookings' });
        }
        const result = await pool.query('DELETE FROM inventory_units WHERE id = $1 RETURNING *;', [req.params.id]);
        if (!result.rows.length) return res.status(404).json({ error: 'Gown not found' });
        res.json({ message: 'Gown removed', unit: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete gown', details: err.message });
    }
});

// ============================================================
// 3. CUSTOMER CRUD
// ============================================================

// GET all customers
app.get('/api/customers', async (req, res) => {
    try {
        const { search } = req.query;
        let query = `SELECT c.*, COUNT(b.id) AS total_bookings
                 FROM customers c
                 LEFT JOIN bookings b ON b.customer_id = c.id`;
        const params = [];

        if (search) {
            params.push(`%${search}%`);
            query += ` WHERE c.full_name ILIKE $1 OR c.email ILIKE $1 OR c.phone ILIKE $1`;
        }
        query += ' GROUP BY c.id ORDER BY c.id DESC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET single customer with booking history
app.get('/api/customers/:id', async (req, res) => {
    try {
        const customer = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
        if (!customer.rows.length) return res.status(404).json({ error: 'Customer not found' });

        const bookings = await pool.query(
            `SELECT b.*, i.model_name, i.designer, i.sku, i.color
       FROM bookings b
       JOIN inventory_units i ON i.id = b.inventory_unit_id
       WHERE b.customer_id = $1
       ORDER BY b.start_date DESC`,
            [req.params.id]
        );

        res.json({ ...customer.rows[0], bookings: bookings.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST new customer
app.post('/api/customers', async (req, res) => {
    const { full_name, email, phone, wedding_date, bust_cm, waist_cm, hips_cm, shoe_size } = req.body;
    try {
        const query = `INSERT INTO customers (full_name, email, phone, wedding_date, bust_cm, waist_cm, hips_cm, shoe_size)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;`;
        const result = await pool.query(query, [full_name, email, phone, wedding_date, bust_cm, waist_cm, hips_cm, shoe_size]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
        res.status(500).json({ error: 'Failed to create customer', details: err.message });
    }
});

// PUT update customer
app.put('/api/customers/:id', async (req, res) => {
    const { full_name, email, phone, wedding_date, bust_cm, waist_cm, hips_cm, shoe_size } = req.body;
    try {
        const query = `UPDATE customers
                   SET full_name=$1, email=$2, phone=$3, wedding_date=$4, bust_cm=$5, waist_cm=$6, hips_cm=$7, shoe_size=$8
                   WHERE id=$9 RETURNING *;`;
        const result = await pool.query(query, [full_name, email, phone, wedding_date, bust_cm, waist_cm, hips_cm, shoe_size, req.params.id]);
        if (!result.rows.length) return res.status(404).json({ error: 'Customer not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update customer', details: err.message });
    }
});

// ============================================================
// 4. BOOKINGS ENGINE
// ============================================================

// GET all bookings (with optional date range filter)
app.get('/api/bookings', async (req, res) => {
    try {
        const { from, to, customer_id } = req.query;
        let query = `SELECT b.*, c.full_name AS customer_name, c.phone AS customer_phone,
                   i.model_name, i.designer, i.sku, i.color, i.size_label
                 FROM bookings b
                 JOIN customers c ON c.id = b.customer_id
                 JOIN inventory_units i ON i.id = b.inventory_unit_id`;
        const conditions = [];
        const params = [];

        if (from) { params.push(from); conditions.push(`b.start_date >= $${params.length}`); }
        if (to) { params.push(to); conditions.push(`b.end_date <= $${params.length}`); }
        if (customer_id) { params.push(customer_id); conditions.push(`b.customer_id = $${params.length}`); }

        if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
        query += ' ORDER BY b.start_date DESC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET single booking
app.get('/api/bookings/:id', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT b.*, c.full_name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
         i.model_name, i.designer, i.sku, i.color, i.size_label, i.rental_price
       FROM bookings b
       JOIN customers c ON c.id = b.customer_id
       JOIN inventory_units i ON i.id = b.inventory_unit_id
       WHERE b.id = $1`,
            [req.params.id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Booking not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST new booking (with 3-day buffer + overlap check)
app.post('/api/bookings', async (req, res) => {
    const { customer_id, inventory_unit_id, start_date, end_date, total_fee } = req.body;
    try {
        // 1. Calculate buffer
        const bufferRes = await pool.query(
            `SELECT ($1::date + INTERVAL '3 days')::date AS buffer_end`, [end_date]
        );
        const buffer_end_date = bufferRes.rows[0].buffer_end;

        // 2. Check for overlapping bookings (including buffer)
        const conflicts = await pool.query(
            `SELECT id, start_date, end_date, buffer_end_date FROM bookings
       WHERE inventory_unit_id = $1
         AND daterange(start_date, buffer_end_date, '[]') && daterange($2::date, $3::date, '[]')`,
            [inventory_unit_id, start_date, buffer_end_date]
        );

        if (conflicts.rows.length > 0) {
            return res.status(409).json({
                error: 'Booking Conflict',
                message: 'This gown is already booked for overlapping dates (including 3-day cleaning buffer).',
                conflicts: conflicts.rows
            });
        }

        // 3. Insert booking
        const query = `INSERT INTO bookings (customer_id, inventory_unit_id, start_date, end_date, buffer_end_date, total_fee)
                   VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;`;
        const result = await pool.query(query, [customer_id, inventory_unit_id, start_date, end_date, buffer_end_date, total_fee]);

        // 4. Update unit status
        await pool.query(`UPDATE inventory_units SET current_status = 'reserved' WHERE id = $1`, [inventory_unit_id]);

        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(400).json({ error: 'Booking Failed', details: err.message });
    }
});

// DELETE booking
app.delete('/api/bookings/:id', async (req, res) => {
    try {
        const booking = await pool.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
        if (!booking.rows.length) return res.status(404).json({ error: 'Booking not found' });

        await pool.query('DELETE FROM bookings WHERE id = $1', [req.params.id]);

        // Check if unit has other bookings, if not set to ready
        const otherBookings = await pool.query(
            'SELECT id FROM bookings WHERE inventory_unit_id = $1', [booking.rows[0].inventory_unit_id]
        );
        if (otherBookings.rows.length === 0) {
            await pool.query(`UPDATE inventory_units SET current_status = 'ready' WHERE id = $1`, [booking.rows[0].inventory_unit_id]);
        }

        res.json({ message: 'Booking cancelled' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// 5. DASHBOARD STATS
// ============================================================
app.get('/api/stats', async (req, res) => {
    try {
        const [inv, cust, bookingsCount, revenue] = await Promise.all([
            pool.query(`SELECT
        COUNT(*) AS total_gowns,
        COUNT(*) FILTER (WHERE current_status = 'ready') AS available,
        COUNT(*) FILTER (WHERE current_status = 'reserved' OR current_status = 'rented') AS booked
        FROM inventory_units`),
            pool.query('SELECT COUNT(*) AS total FROM customers'),
            pool.query('SELECT COUNT(*) AS total FROM bookings'),
            pool.query('SELECT COALESCE(SUM(total_fee), 0) AS total_revenue FROM bookings'),
        ]);

        res.json({
            inventory: inv.rows[0],
            customers: parseInt(cust.rows[0].total),
            bookings: parseInt(bookingsCount.rows[0].total),
            revenue: parseFloat(revenue.rows[0].total_revenue),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// BOOT
// ============================================================
app.listen(PORT, () => {
    console.log(`\n  ✦ FARYAL AL HOSARY ENGINE`);
    console.log(`  ✦ Port ${PORT}`);
    console.log(`  ✦ CORS: ${allowedOrigins.join(', ')}\n`);
});