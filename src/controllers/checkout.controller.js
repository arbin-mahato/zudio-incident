const pool = require('../db')

const checkout = async (req, res) => {
  const client = await pool.connect()
  try {
    const userId = req.user.userId
    const { items, couponCode, shippingAddress } = req.body

    // items should be an array of { productId, quantity }
    if (!items || items.length === 0) {
      client.release()
      return res.status(400).json({ error: 'Cart is empty' })
    }

    if (!shippingAddress) {
      client.release()
      return res.status(400).json({ error: 'Shipping address is required' })
    }

    await client.query('BEGIN')

    // calculate total price by fetching each product
    let totalAmount = 0
    const cartItems = []

    for (const item of items) {
      const productResult = await client.query(
        'SELECT id, name, price, stock FROM products WHERE id = $1 FOR UPDATE',
        [item.productId]
      )

      if (productResult.rows.length === 0) {
        await client.query('ROLLBACK')
        client.release()
        return res.status(404).json({ error: `Product ${item.productId} not found` })
      }

      const product = productResult.rows[0]

      if (product.stock < item.quantity) {
        await client.query('ROLLBACK')
        client.release()
        return res.status(400).json({ error: `Insufficient stock for ${product.name}` })
      }

      totalAmount += parseFloat(product.price) * item.quantity
      cartItems.push({ ...item, product })
    }

    let discount = 0

    // validate and apply coupon if provided
    if (couponCode) {
      const couponResult = await client.query(
        'UPDATE coupons SET used = true WHERE code = $1 AND used = false AND expires_at > NOW() RETURNING *',
        [couponCode]
      )

      if (couponResult.rows.length === 0) {
        await client.query('ROLLBACK')
        client.release()
        return res.status(400).json({ error: 'Invalid or expired coupon' })
      }

      const coupon = couponResult.rows[0]
      discount = parseFloat(coupon.discount_amount)
      totalAmount = Math.max(0, totalAmount - discount)
    }

    // create the order
    const orderResult = await client.query(
      'INSERT INTO orders (user_id, total_amount, discount, shipping_address, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userId, totalAmount, discount, shippingAddress, 'pending']
    )

    const order = orderResult.rows[0]

    // insert order items and update stock
    for (const item of cartItems) {
      await client.query(
        'INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, unit_price) VALUES ($1, $2, $3, $4, $5, $6)',
        [order.id, item.productId, item.product.name, item.product.price, item.quantity, item.product.price]
      )

      const stockUpdateResult = await client.query(
        'UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING stock',
        [item.quantity, item.productId]
      )

      if (stockUpdateResult.rows.length === 0) {
        await client.query('ROLLBACK')
        client.release()
        return res.status(400).json({ error: `Insufficient stock for ${item.product.name}` })
      }
    }

    await client.query('COMMIT')
    client.release()

    res.status(201).json({
      message: 'Order placed successfully',
      order,
      discount: discount > 0 ? discount : undefined,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    client.release()
    console.error('checkout error:', err.message)
    res.status(500).json({ error: 'Checkout failed' })
  }
}

module.exports = { checkout }
