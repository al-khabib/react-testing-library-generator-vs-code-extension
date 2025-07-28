import grpc
from concurrent import futures
import gen_pb2
import gen_pb2_grpc
from transformers import pipeline, BitsAndBytesConfig


class GeneratorServicer(gen_pb2_grpc.GeneratorServicer):
    def __init__(self):
        quantization_config = BitsAndBytesConfig(load_in_4bit=True)
        self.pipe = pipeline(
            "text-generation",
            model="codellama/CodeLlama-7b-Instruct-hf",
            device_map="auto",
            quantization_config=quantization_config
        )

    def GenerateTest(self, request, context):
        prompt = f"Generate a simple RTL test for React component:\n{request.source}\nComponent: {request.component_name}"
        generated = self.pipe(prompt, max_new_tokens=200, do_sample=False)[
            0]["generated_text"]
        return gen_pb2.GenerateResponse(test_code=generated)


def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    gen_pb2_grpc.add_GeneratorServicer_to_server(GeneratorServicer(), server)
    server.add_insecure_port('[::]:9000')
    server.start()
    server.wait_for_termination()


if __name__ == '__main__':
    serve()
