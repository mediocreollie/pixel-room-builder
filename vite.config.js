import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { buildMockGenerateItemResponse } from './api/generate-item-response.js'

function mockGenerateItemApiPlugin() {
  return {
    name: 'mock-generate-item-api',
    configureServer(server) {
      server.middlewares.use('/api/generate-item', (request, response, next) => {
        if (request.method !== 'POST') {
          response.statusCode = 405
          response.setHeader('Allow', 'POST')
          response.setHeader('Content-Type', 'application/json')
          response.end(
            JSON.stringify({
              error: 'Method not allowed. Use POST.',
            })
          )
          return
        }

        const contentType = request.headers['content-type'] || ''

        if (!contentType.includes('multipart/form-data')) {
          response.statusCode = 400
          response.setHeader('Content-Type', 'application/json')
          response.end(
            JSON.stringify({
              error: 'Expected multipart/form-data with an image upload.',
            })
          )
          return
        }

        const itemIdMatch = request.url?.match(/itemId=([^&]+)/)
        const itemNumberMatch = request.url?.match(/itemNumber=([^&]+)/)
        const itemId = itemIdMatch ? decodeURIComponent(itemIdMatch[1]) : undefined
        const parsedItemNumber = Number.parseInt(
          itemNumberMatch ? decodeURIComponent(itemNumberMatch[1]) : '1',
          10
        )
        const itemNumber = Number.isNaN(parsedItemNumber) ? 1 : parsedItemNumber

        response.statusCode = 200
        response.setHeader('Content-Type', 'application/json')
        response.end(
          JSON.stringify(buildMockGenerateItemResponse({ itemId, itemNumber }))
        )
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), mockGenerateItemApiPlugin()],
})
