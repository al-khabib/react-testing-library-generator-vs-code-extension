from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Optional as _Optional

DESCRIPTOR: _descriptor.FileDescriptor

class TestRequest(_message.Message):
    __slots__ = ("component_code", "component_name", "file_path")
    COMPONENT_CODE_FIELD_NUMBER: _ClassVar[int]
    COMPONENT_NAME_FIELD_NUMBER: _ClassVar[int]
    FILE_PATH_FIELD_NUMBER: _ClassVar[int]
    component_code: str
    component_name: str
    file_path: str
    def __init__(self, component_code: _Optional[str] = ..., component_name: _Optional[str] = ..., file_path: _Optional[str] = ...) -> None: ...

class TestResponse(_message.Message):
    __slots__ = ("test_code", "success", "error_message")
    TEST_CODE_FIELD_NUMBER: _ClassVar[int]
    SUCCESS_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    test_code: str
    success: bool
    error_message: str
    def __init__(self, test_code: _Optional[str] = ..., success: bool = ..., error_message: _Optional[str] = ...) -> None: ...
