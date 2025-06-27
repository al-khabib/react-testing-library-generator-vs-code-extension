const express = require('express')
const cors = require('cors')
const grpc = require('@grpc/grpc-js')
const protoLoader = require('@grpc/proto-loader')
const path = require('path')

const app = express()
const PORT = 3001

// Middleware
app.use(cors())
app.use(express.json({ limit: '10mb' }))

// Load gRPC proto
const PROTO_PATH = path.join(__dirname, '..', 'proto', 'test_generator.proto')
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
})

const testGeneratorProto =
  grpc.loadPackageDefinition(packageDefinition).testgenerator

// Create gRPC client to Python backend
const grpcClient = new testGeneratorProto.TestGeneratorService(
  'localhost:50051',
  grpc.credentials.createInsecure()
)

// API Routes
app.post('/api/generate-test', async (req, res) => {
  try {
    const { componentCode, componentName, filePath } = req.body

    console.log(
      `🚀 API Server: Generating test for component: ${componentName}`
    )

    // Create gRPC request
    const grpcRequest = {
      component_code: componentCode,
      component_name: componentName,
      file_path: filePath
    }

    // Call Python gRPC service
    grpcClient.GenerateTest(grpcRequest, (error, response) => {
      if (error) {
        console.error('gRPC Error:', error)
        return res.status(500).json({
          success: false,
          error: 'Failed to generate test via gRPC',
          details: error.message
        })
      }

      console.log(`✅ Test generated successfully for ${componentName}`)
      res.json({
        success: response.success,
        testCode: response.test_code,
        error: response.error_message
      })
    })
  } catch (error) {
    console.error('API Error:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    })
  }
})

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    services: {
      api: 'running',
      grpc: 'connected to localhost:50051',
      llm: 'Code Llama via Ollama'
    }
  })
})

app.listen(PORT, () => {
  console.log(`🚀 Extension API Server running on http://localhost:${PORT}`)
  console.log(`📡 Connecting to Python gRPC server on localhost:50051`)
  console.log(`🦙 Using Code Llama for test generation`)
})
