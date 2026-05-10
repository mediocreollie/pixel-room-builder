import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import {
  generateFurnitureItem,
  readJsonRequestBody,
} from './api/generate-item-service.js'

function mockGenerateItemApiPlugin() {
  return {
    name: 'mock-generate-item-api',
    configureServer(server) {
      server.middlewares.use('/api/generate-item', async (request, response, next) => {
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

        if (!contentType.includes('application/json')) {
          response.statusCode = 400
          response.setHeader('Content-Type', 'application/json')
          response.end(
            JSON.stringify({
              error: 'Expected application/json with an imageDataUrl payload.',
            })
          )
          return
        }

        try {
          const payload = await readJsonRequestBody(request)
          const generatedItem = await generateFurnitureItem(payload)

          response.statusCode = 200
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify(generatedItem))
        } catch (error) {
          response.statusCode = 500
          response.setHeader('Content-Type', 'application/json')
          response.end(
            JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : 'Unable to generate an item image right now.',
            })
          )
        }
      })
    },
  }
}

function applyServerEnv(mode) {
  const loadedEnv = loadEnv(mode, process.cwd(), '')
  Object.assign(process.env, loadedEnv)

  console.info('[vite-dev-api] server env status', {
    generationProvider: process.env.GENERATION_PROVIDER || 'comfyui',
    comfyUiBaseUrl: process.env.COMFYUI_BASE_URL || 'http://127.0.0.1:8188',
    comfyUiWorkflowMode: process.env.COMFYUI_WORKFLOW_MODE || 'txt2img',
    hasComfyUiCheckpointName:
      typeof process.env.COMFYUI_CHECKPOINT_NAME === 'string' &&
      process.env.COMFYUI_CHECKPOINT_NAME.trim().length > 0,
    hasOpenAiApiKey:
      typeof process.env.OPENAI_API_KEY === 'string' &&
      process.env.OPENAI_API_KEY.trim().length > 0,
  })
}

export default defineConfig(({ mode }) => {
  applyServerEnv(mode)

  return {
    plugins: [react(), mockGenerateItemApiPlugin()],
  }
})
