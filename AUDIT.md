# Zudio Security & Performance Audit

## Profiling Table

| Endpoint                         | Response Time | Query Count | Observation |
|----------------------------------|---------------|-------------|-------------|
| GET /api/products                | 12ms          | 1           | Returns first page of products ordered by created_at DESC |
| GET /api/products?search=shirt   | 0ms           | 1           | Returns 0 products because search is case-sensitive LIKE |
| GET /api/orders/history          | 11ms          | 106         | N+1 query issue makes query count grow with orders and items |
| POST /api/cart/checkout          | 2ms           | 7           | Checkout succeeds, applies coupon code, doesn't update stock |
