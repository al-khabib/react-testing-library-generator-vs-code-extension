# Generated by the gRPC Python protocol compiler plugin. DO NOT EDIT!
"""Client and server classes corresponding to protobuf-defined services."""
import grpc
import warnings

import test_generator_pb2 as test__generator__pb2

GRPC_GENERATED_VERSION = '1.73.1'
GRPC_VERSION = grpc.__version__
_version_not_supported = False

try:
    from grpc._utilities import first_version_is_lower
    _version_not_supported = first_version_is_lower(GRPC_VERSION, GRPC_GENERATED_VERSION)
except ImportError:
    _version_not_supported = True

if _version_not_supported:
    raise RuntimeError(
        f'The grpc package installed is at version {GRPC_VERSION},'
        + f' but the generated code in test_generator_pb2_grpc.py depends on'
        + f' grpcio>={GRPC_GENERATED_VERSION}.'
        + f' Please upgrade your grpc module to grpcio>={GRPC_GENERATED_VERSION}'
        + f' or downgrade your generated code using grpcio-tools<={GRPC_VERSION}.'
    )


class TestGeneratorServiceStub(object):
    """Missing associated documentation comment in .proto file."""

    def __init__(self, channel):
        """Constructor.

        Args:
            channel: A grpc.Channel.
        """
        self.GenerateTest = channel.unary_unary(
                '/testgenerator.TestGeneratorService/GenerateTest',
                request_serializer=test__generator__pb2.TestRequest.SerializeToString,
                response_deserializer=test__generator__pb2.TestResponse.FromString,
                _registered_method=True)


class TestGeneratorServiceServicer(object):
    """Missing associated documentation comment in .proto file."""

    def GenerateTest(self, request, context):
        """Missing associated documentation comment in .proto file."""
        context.set_code(grpc.StatusCode.UNIMPLEMENTED)
        context.set_details('Method not implemented!')
        raise NotImplementedError('Method not implemented!')


def add_TestGeneratorServiceServicer_to_server(servicer, server):
    rpc_method_handlers = {
            'GenerateTest': grpc.unary_unary_rpc_method_handler(
                    servicer.GenerateTest,
                    request_deserializer=test__generator__pb2.TestRequest.FromString,
                    response_serializer=test__generator__pb2.TestResponse.SerializeToString,
            ),
    }
    generic_handler = grpc.method_handlers_generic_handler(
            'testgenerator.TestGeneratorService', rpc_method_handlers)
    server.add_generic_rpc_handlers((generic_handler,))
    server.add_registered_method_handlers('testgenerator.TestGeneratorService', rpc_method_handlers)


 # This class is part of an EXPERIMENTAL API.
class TestGeneratorService(object):
    """Missing associated documentation comment in .proto file."""

    @staticmethod
    def GenerateTest(request,
            target,
            options=(),
            channel_credentials=None,
            call_credentials=None,
            insecure=False,
            compression=None,
            wait_for_ready=None,
            timeout=None,
            metadata=None):
        return grpc.experimental.unary_unary(
            request,
            target,
            '/testgenerator.TestGeneratorService/GenerateTest',
            test__generator__pb2.TestRequest.SerializeToString,
            test__generator__pb2.TestResponse.FromString,
            options,
            channel_credentials,
            insecure,
            call_credentials,
            compression,
            wait_for_ready,
            timeout,
            metadata,
            _registered_method=True)
