const PORT = 3001;
const BASE_URL = `http://localhost:${PORT}`;

async function run() {
  const email = `test_${Date.now()}@example.com`;
  const password = 'password123';

  // 1. GET /api/products
  console.log('--- 1. GET /api/products ---');
  let res = await fetch(`${BASE_URL}/api/products`);
  let json = await res.json();
  console.log(`Status: ${res.status}, Count: ${json.count}`);

  // 2. GET /api/products?search=shirt
  console.log('--- 2. GET /api/products?search=shirt ---');
  res = await fetch(`${BASE_URL}/api/products?search=shirt`);
  json = await res.json();
  console.log(`Status: ${res.status}, Count: ${json.count}`);

  // 3. GET /api/products?search=shirt' OR '1'='1
  console.log("--- 3. GET /api/products?search=shirt' OR '1'='1 ---");
  res = await fetch(`${BASE_URL}/api/products?search=shirt%27%20OR%20%271%27%3D%271`);
  json = await res.json();
  console.log(`Status: ${res.status}, Count: ${json.count}`);

  // 4. POST /api/auth/register
  console.log('--- 4. POST /api/auth/register ---');
  res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Incident Tester', email, password })
  });
  json = await res.json();
  console.log(`Status: ${res.status}, Message: ${json.message}`);
  const registeredToken = json.token;

  // 5. POST /api/auth/login (as aarav.sharma@example.com)
  console.log('--- 5. POST /api/auth/login (aarav.sharma@example.com) ---');
  res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'aarav.sharma@example.com', password: 'aarav1000' })
  });
  json = await res.json();
  console.log(`Status: ${res.status}, Message: ${json.message}`);
  const loginToken = json.token;

  // 6. GET /api/orders/history
  console.log('--- 6. GET /api/orders/history ---');
  res = await fetch(`${BASE_URL}/api/orders/history`, {
    headers: { 'Authorization': `Bearer ${loginToken}` }
  });
  json = await res.json();
  console.log(`Status: ${res.status}, Orders count: ${json.orders ? json.orders.length : 0}`);
  if (json.orders && json.orders.length > 0) {
    console.log(`First order items count: ${json.orders[0].items.length}`);
  }

  // 7. POST /api/cart/checkout (using registeredToken and Apply coupon ZUDIO100)
  console.log('--- 7. POST /api/cart/checkout (Apply coupon ZUDIO100) ---');
  res = await fetch(`${BASE_URL}/api/cart/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${registeredToken}`
    },
    body: JSON.stringify({
      items: [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 1 }
      ],
      couponCode: 'ZUDIO100',
      shippingAddress: '123 Testing Lane'
    })
  });
  json = await res.json();
  console.log(`Status: ${res.status}, Message: ${json.message}`);

  // 8. POST /api/cart/checkout (Same coupon again)
  console.log('--- 8. POST /api/cart/checkout (Same coupon again) ---');
  res = await fetch(`${BASE_URL}/api/cart/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${registeredToken}`
    },
    body: JSON.stringify({
      items: [
        { productId: 3, quantity: 1 }
      ],
      couponCode: 'ZUDIO100',
      shippingAddress: '123 Testing Lane'
    })
  });
  json = await res.json();
  console.log(`Status: ${res.status}, Message: ${json.message}`);

  // 9. GET /api/products (check stock)
  console.log('--- 9. GET /api/products (check stock) ---');
  res = await fetch(`${BASE_URL}/api/products`);
  json = await res.json();
  // Find products in the products list
  const prod1 = json.products.find(p => p.id === 1);
  const prod2 = json.products.find(p => p.id === 2);
  console.log(`Product 1 stock: ${prod1 ? prod1.stock : 'N/A'}`);
  console.log(`Product 2 stock: ${prod2 ? prod2.stock : 'N/A'}`);
}

run().catch(console.error);
