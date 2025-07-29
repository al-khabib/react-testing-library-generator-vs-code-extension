from fastapi import FastAPI
import grpc
import gen_pb2
import gen_pb2_grpc

app = FastAPI()


@app.post("/generate")
async def generate_test(body: dict):
    channel = grpc.insecure_channel("localhost:9000")
    stub = gen_pb2_grpc.GeneratorStub(channel)
    request = gen_pb2.GenerateRequest(source=body.get(
        "source", ""), component_name=body.get("component_name", ""))
    response = stub.GenerateTest(request)
    return {"test_code": response.test_code}
