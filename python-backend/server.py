import grpc
from concurrent import futures
import logging
import requests
import json
import re

# Import generated gRPC code
import test_generator_pb2
import test_generator_pb2_grpc


class TestGeneratorService(test_generator_pb2_grpc.TestGeneratorServiceServicer):
    def __init__(self):
        self.ollama_url = "http://localhost:11434/api/generate"
        self.model_name = "codellama:13b-instruct"

    def GenerateTest(self, request, context):
        """Generate React Testing Library tests using Code Llama"""
        try:
            logging.info(
                f"🦙 Generating test for component: {request.component_name}")

            # Generate test using Code Llama
            test_code = self._generate_test_with_ollama(
                request.component_code,
                request.component_name
            )

            return test_generator_pb2.TestResponse(
                test_code=test_code,
                success=True,
                error_message=""
            )

        except Exception as e:
            logging.error(f"Test generation failed: {e}")
            # Fallback to basic template
            fallback_test = self._generate_fallback_test(
                request.component_name)

            return test_generator_pb2.TestResponse(
                test_code=fallback_test,
                success=True,
                error_message=f"Code Llama failed, used fallback: {str(e)}"
            )

    def _generate_test_with_ollama(self, component_code: str, component_name: str) -> str:
        """Generate test using Code Llama via Ollama"""
        prompt = self._create_rtl_prompt(component_code, component_name)

        payload = {
            "model": self.model_name,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.2,
                "top_p": 0.9,
                "num_predict": 1500
            }
        }

        try:
            logging.info("🤖 Calling Code Llama...")
            response = requests.post(
                self.ollama_url, json=payload, timeout=120)
            response.raise_for_status()

            result = response.json()
            generated_code = result.get("response", "").strip()

            # Clean up the response to extract just the test code
            return self._clean_generated_code(generated_code)

        except requests.exceptions.RequestException as e:
            logging.error(f"Ollama request failed: {e}")
            raise Exception(f"Code Llama generation failed: {e}")

    def _create_rtl_prompt(self, component_code: str, component_name: str) -> str:
        """Create specialized prompt for Code Llama"""
        return f"""You are an expert React Testing Library developer. Generate comprehensive unit tests for this React component.

Component Name: {component_name}

Component Code:

Generate a complete React Testing Library test file that includes:
1. Proper imports (render, screen, userEvent, jest-dom)
2. Test for component rendering
3. Tests for props and their effects
4. Tests for user interactions and events
5. TypeScript types and proper assertions
6. Use RTL best practices (getByRole, getByLabelText, etc.)

Generate ONLY the test code, properly formatted and ready to use:

"""

    def _clean_generated_code(self, generated_code: str) -> str:
        """Clean and extract test code from LLM response"""
        # Remove markdown code blocks if present
        if "```" in generated_code:
            # Extract content between code blocks
            parts = generated_code.split("```")
            for i, part in enumerate(parts):
                if part.strip().startswith(("typescript", "ts", "javascript", "js")) or i == 1:
                    # Remove language identifier and return the code
                    code = part.replace("typescript", "").replace(
                        "javascript", "").replace("ts", "").replace("js", "").strip()
                    if code and ("import" in code or "describe" in code):
                        return code

        # If no code blocks, return as is but clean up
        return generated_code.strip()

    def _generate_fallback_test(self, component_name: str) -> str:
        """Generate basic fallback test template"""
        return f"""import {{ render, screen }} from '@testing-library/react';
        import '@testing-library/jest-dom';
        import userEvent from '@testing-library/user-event';
        import {component_name} from './{component_name}';

        describe('{component_name}', () => {{
        test('renders without crashing', () => {{
            render(<{component_name} />);
        }});

        test('displays component content correctly', () => {{
            render(<{component_name} />);
            // Add specific assertions based on your component
        }});
        }});
        """


def serve():
    """Start the gRPC server"""
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    test_generator_pb2_grpc.add_TestGeneratorServiceServicer_to_server(
        TestGeneratorService(), server
    )

    listen_addr = '[::]:50051'
    server.add_insecure_port(listen_addr)

    logging.info(f"🐍 Python gRPC Server starting on {listen_addr}")
    logging.info(f"🦙 Using Code Llama model: codellama:13b-instruct")
    server.start()
    server.wait_for_termination()


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    serve()
