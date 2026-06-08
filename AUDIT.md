# Zudio Security & Performance Audit

## Profiling Table

| Endpoint                         | Response Time | Query Count | Observation |
|----------------------------------|---------------|-------------|-------------|
| GET /api/products                | 12ms          | 1           | Returns first page of products ordered by created_at DESC |
| GET /api/products?search=shirt   | 0ms           | 1           | Returns 0 products because search is case-sensitive LIKE |
| GET /api/orders/history          | 11ms          | 106         | N+1 query issue makes query count grow with orders and items |
| POST /api/cart/checkout          | 2ms           | 7           | Checkout succeeds, applies coupon code, doesn't update stock |

---

## Bug 1: SQL Injection in Search

**Severity:** CRITICAL
**File:** src/controllers/product.controller.js
**Line:** 14

**Root Cause:**
User input from `req.query.search` is directly concatenated into the SQL query string rather than using parameterized queries.

**Reproduction Steps:**
1. Send request: `GET /api/products?search=shirt' OR '1'='1`
2. Observe the response returns all database records instead of shirt matches.
3. Expected: Returns only literal match of the string "shirt' OR '1'='1" (0 matches). Actual: Returns all products in the database.

**Affected Users / Impact:**
Exposes the entire database contents, allows attackers to bypass search constraints, and potentially drop tables or manipulate database contents.

**Fix Plan:**
Replace string concatenation with parameterized queries: `SELECT * FROM products WHERE name LIKE $1` and pass `['%' + search + '%']` as the parameter array.

---

## Bug 2: Plaintext Password Storage & Comparison

**Severity:** CRITICAL
**File:** src/controllers/auth.controller.js
**Line:** 25 (Insert) and 67 (Comparison)

**Root Cause:**
Passwords are saved directly to the database as plain text on registration and compared directly on login, instead of using cryptographic hashing.

**Reproduction Steps:**
1. Register a new user using `/api/auth/register`.
2. Inspect the database table `users` by running: `SELECT password FROM users WHERE email = $1`.
3. Observe the password column shows the raw value in plaintext.
4. Expected: Password should be hashed with bcrypt. Actual: Password is plain text.

**Affected Users / Impact:**
If the database or server is compromised, all user passwords will be exposed in plain text, leading to massive credential stuffing vulnerability.

**Fix Plan:**
Use `bcrypt` to hash passwords with 12 rounds on registration, and use `bcrypt.compare` during login validation.

---

## Bug 3: Double Discount Race Condition

**Severity:** HIGH
**File:** src/controllers/checkout.controller.js
**Line:** 45

**Root Cause:**
Validation of the coupon code and marking it as used are performed in two separate SQL operations, making it vulnerable to race conditions (TOCTOU).

**Reproduction Steps:**
1. Send concurrent checkout requests containing the same single-use coupon code.
2. Observe both checkouts validate successfully before either marks the coupon as used.
3. Expected: Only the first checkout should succeed, subsequent ones should return a 400 error. Actual: Multiple orders are processed with the same single-use coupon.

**Affected Users / Impact:**
Allows single-use coupons to be used hundreds of times, causing major financial losses for the business.

**Fix Plan:**
Validate and mark the coupon as used atomically using `UPDATE coupons SET used = true WHERE code = $1 AND used = false AND expires_at > NOW() RETURNING *`. If no row is returned, the coupon is invalid or already used.

---

## Bug 4: Commented-out Stock Decrement & Missing Transactions

**Severity:** HIGH
**File:** src/controllers/checkout.controller.js
**Line:** 79 & 109

**Root Cause:**
The code that decrements product stock is completely commented out, allowing purchases without updating inventory. Additionally, multiple database inserts are executed without a transaction wrapper.

**Reproduction Steps:**
1. Check the stock of product ID 1: `GET /api/products` (stock is 243).
2. Place an order for product ID 1.
3. Check stock again: `GET /api/products`.
4. Observe the stock remains 243.
5. Expected: Stock decreases by the order quantity. Actual: Stock is unchanged.

**Affected Users / Impact:**
Sellers oversell items beyond actual inventory capacity, leading to fulfillment failures, negative stock values, and customer complaints.

**Fix Plan:**
Re-enable stock update queries, wrap all checkout queries inside database transactions (`BEGIN`, `COMMIT`, `ROLLBACK`), and append `AND stock >= $1` to the update query to fail the transaction if there is insufficient stock.

---

## Bug 5: N+1 Query in Order History

**Severity:** MEDIUM
**File:** src/controllers/order.controller.js
**Line:** 17

**Root Cause:**
The endpoint loops over every order to run queries for its order items, and then loops over each order item to run queries for its product details, causing $1 + N + M$ queries.

**Reproduction Steps:**
1. Fetch history using `GET /api/orders/history`.
2. Inspect the profiling logs on the server terminal.
3. Observe a massive number of query execution lines for a single HTTP request (e.g. 106 queries for 15 orders).
4. Expected: Single or minimal queries using joins. Actual: Linear scaling query count.

**Affected Users / Impact:**
Server CPU and database connection saturation under high load, leading to extreme delays (seconds or timeouts) when fetching order histories.

**Fix Plan:**
Refactor the queries to use a single SQL `JOIN` fetching orders, order items, and product details in one round trip, then structure the result format in Javascript. Add missing indexes on foreign keys.

---

## Verification Table

| Bug | Before | After | Verification Method |
|-----|--------|-------|---------------------|
| SQL Injection | Returns all products (200 records) | Returns 0 results (literal search) | GET /api/products?search=shirt' OR '1'='1 |
| Plaintext Passwords | Password column: "password123" | Password column: "$2b$12$..." | SELECT password FROM users WHERE email='test_xxx@example.com' |
| Double Discount | Coupon applied multiple times | 2nd concurrent checkout attempt returns 400 | POST /api/cart/checkout × 2 same coupon |
| Stock Decrement | Stock unchanged after purchase | Stock reduced by quantity purchased | GET /api/products before vs after checkout |
| N+1 Order History | 11ms / 106 queries | 4ms / 2 queries | Profiling middleware output |

