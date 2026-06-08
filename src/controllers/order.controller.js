const pool = require('../db')

// get all orders for the logged in user
const getOrderHistory = async (req, res) => {
  try {
    const userId = req.user.userId
    const limit = parseInt(req.query.limit) || 20
    const offset = parseInt(req.query.offset) || 0

    // fetch orders first
    const ordersResult = await pool.query(
      'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [userId, limit, offset]
    )

    const orders = ordersResult.rows

    if (orders.length === 0) {
      return res.json({ orders: [] })
    }

    const orderIds = orders.map(o => o.id)

    // fetch all order items with product details in a single query
    const itemsResult = await pool.query(
      `SELECT oi.id, oi.order_id, oi.product_id, oi.product_name, oi.product_price, oi.quantity, oi.unit_price, oi.created_at,
              p.name AS p_name, p.price AS p_price, p.image_url AS p_image_url
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ANY($1)`,
      [orderIds]
    )

    const itemsByOrderId = {}
    for (const row of itemsResult.rows) {
      const orderId = row.order_id
      if (!itemsByOrderId[orderId]) {
        itemsByOrderId[orderId] = []
      }
      itemsByOrderId[orderId].push({
        id: row.id,
        order_id: row.order_id,
        product_id: row.product_id,
        product_name: row.product_name,
        product_price: row.product_price,
        quantity: row.quantity,
        unit_price: row.unit_price,
        created_at: row.created_at,
        product: row.product_id ? {
          id: row.product_id,
          name: row.p_name,
          price: row.p_price,
          image_url: row.p_image_url
        } : null
      })
    }

    for (const order of orders) {
      order.items = itemsByOrderId[order.id] || []
    }

    res.json({ orders })
  } catch (err) {
    console.error('getOrderHistory error:', err.message)
    res.status(500).json({ error: 'Failed to fetch order history' })
  }
}

// update order status — admin only
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' })
    }

    const result = await pool.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' })
    }

    res.json({ message: 'Order status updated', order: result.rows[0] })
  } catch (err) {
    console.error('updateOrderStatus error:', err.message)
    res.status(500).json({ error: 'Failed to update order status' })
  }
}

module.exports = { getOrderHistory, updateOrderStatus }
