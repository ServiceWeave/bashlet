"""Tests for JSON Schema definitions."""

import pytest

from bashlet.schemas.json_schema import (
    EXEC_JSON_SCHEMA,
    LIST_DIR_JSON_SCHEMA,
    READ_FILE_JSON_SCHEMA,
    WRITE_FILE_JSON_SCHEMA,
)


class TestExecJsonSchema:
    """Tests for EXEC_JSON_SCHEMA."""

    def test_has_correct_type(self) -> None:
        assert EXEC_JSON_SCHEMA["type"] == "object"

    def test_has_properties(self) -> None:
        assert "properties" in EXEC_JSON_SCHEMA
        assert "command" in EXEC_JSON_SCHEMA["properties"]
        assert "workdir" in EXEC_JSON_SCHEMA["properties"]

    def test_command_property(self) -> None:
        command = EXEC_JSON_SCHEMA["properties"]["command"]
        assert command["type"] == "string"
        assert "description" in command
        assert len(command["description"]) > 0

    def test_workdir_property(self) -> None:
        workdir = EXEC_JSON_SCHEMA["properties"]["workdir"]
        assert workdir["type"] == "string"
        assert "description" in workdir

    def test_required_fields(self) -> None:
        assert "required" in EXEC_JSON_SCHEMA
        assert "command" in EXEC_JSON_SCHEMA["required"]
        assert "workdir" not in EXEC_JSON_SCHEMA["required"]

    def test_additional_properties_false(self) -> None:
        assert EXEC_JSON_SCHEMA["additionalProperties"] is False


class TestReadFileJsonSchema:
    """Tests for READ_FILE_JSON_SCHEMA."""

    def test_has_correct_type(self) -> None:
        assert READ_FILE_JSON_SCHEMA["type"] == "object"

    def test_has_path_property(self) -> None:
        assert "path" in READ_FILE_JSON_SCHEMA["properties"]
        path = READ_FILE_JSON_SCHEMA["properties"]["path"]
        assert path["type"] == "string"
        assert "description" in path

    def test_required_fields(self) -> None:
        assert READ_FILE_JSON_SCHEMA["required"] == ["path"]

    def test_additional_properties_false(self) -> None:
        assert READ_FILE_JSON_SCHEMA["additionalProperties"] is False


class TestWriteFileJsonSchema:
    """Tests for WRITE_FILE_JSON_SCHEMA."""

    def test_has_correct_type(self) -> None:
        assert WRITE_FILE_JSON_SCHEMA["type"] == "object"

    def test_has_path_property(self) -> None:
        path = WRITE_FILE_JSON_SCHEMA["properties"]["path"]
        assert path["type"] == "string"
        assert "description" in path

    def test_has_content_property(self) -> None:
        content = WRITE_FILE_JSON_SCHEMA["properties"]["content"]
        assert content["type"] == "string"
        assert "description" in content
        assert "content" in content["description"].lower()

    def test_required_fields(self) -> None:
        required = WRITE_FILE_JSON_SCHEMA["required"]
        assert "path" in required
        assert "content" in required

    def test_additional_properties_false(self) -> None:
        assert WRITE_FILE_JSON_SCHEMA["additionalProperties"] is False


class TestListDirJsonSchema:
    """Tests for LIST_DIR_JSON_SCHEMA."""

    def test_has_correct_type(self) -> None:
        assert LIST_DIR_JSON_SCHEMA["type"] == "object"

    def test_has_path_property(self) -> None:
        path = LIST_DIR_JSON_SCHEMA["properties"]["path"]
        assert path["type"] == "string"
        assert "description" in path
        assert "directory" in path["description"].lower()

    def test_required_fields(self) -> None:
        assert LIST_DIR_JSON_SCHEMA["required"] == ["path"]

    def test_additional_properties_false(self) -> None:
        assert LIST_DIR_JSON_SCHEMA["additionalProperties"] is False


class TestSchemaConsistency:
    """Tests for schema consistency across all schemas."""

    def test_all_schemas_are_objects(self) -> None:
        schemas = [
            EXEC_JSON_SCHEMA,
            READ_FILE_JSON_SCHEMA,
            WRITE_FILE_JSON_SCHEMA,
            LIST_DIR_JSON_SCHEMA,
        ]
        for schema in schemas:
            assert schema["type"] == "object"

    def test_all_schemas_disallow_additional_properties(self) -> None:
        schemas = [
            EXEC_JSON_SCHEMA,
            READ_FILE_JSON_SCHEMA,
            WRITE_FILE_JSON_SCHEMA,
            LIST_DIR_JSON_SCHEMA,
        ]
        for schema in schemas:
            assert schema["additionalProperties"] is False

    def test_all_schemas_have_required_array(self) -> None:
        schemas = [
            EXEC_JSON_SCHEMA,
            READ_FILE_JSON_SCHEMA,
            WRITE_FILE_JSON_SCHEMA,
            LIST_DIR_JSON_SCHEMA,
        ]
        for schema in schemas:
            assert isinstance(schema["required"], list)

    def test_all_property_descriptions_are_non_empty(self) -> None:
        schemas = [
            EXEC_JSON_SCHEMA,
            READ_FILE_JSON_SCHEMA,
            WRITE_FILE_JSON_SCHEMA,
            LIST_DIR_JSON_SCHEMA,
        ]
        for schema in schemas:
            for prop_name, prop in schema["properties"].items():
                assert "description" in prop, f"Missing description for {prop_name}"
                assert len(prop["description"]) > 0, f"Empty description for {prop_name}"
