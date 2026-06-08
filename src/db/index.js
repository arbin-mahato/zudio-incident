const { Pool } = require('pg')
const dotenv = require('dotenv')

dotenv.config()

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // max connections — keep this low for now, we'll tune later
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err)
})


const originalConnect = pool.connect.bind(pool)
pool.connect = (...args) => {
  const callback = args[0]
  if (typeof callback === 'function') {
    return originalConnect((err, client, release) => {
      if (client && !client._isWrapped) {
        client._isWrapped = true
        const originalClientQuery = client.query.bind(client)
        client.query = (...queryArgs) => {
          if (global.currentRequest) global.currentRequest._queryCount++
          return originalClientQuery(...queryArgs)
        }
      }
      callback(err, client, release)
    })
  } else {
    return originalConnect(...args).then(client => {
      if (client && !client._isWrapped) {
        client._isWrapped = true
        const originalClientQuery = client.query.bind(client)
        client.query = (...queryArgs) => {
          if (global.currentRequest) global.currentRequest._queryCount++
          return originalClientQuery(...queryArgs)
        }
      }
      return client
    })
  }
}

module.exports = pool
