/**
 * JSON Schema type definition (simplified for our needs)
 */
interface JSONSchema {
    type: string;
    description?: string;
    properties?: Record<string, JSONSchema>;
    required?: string[];
    additionalProperties?: boolean;
    items?: JSONSchema;
    enum?: string[];
}
/**
 * JSON Schema for bashlet_exec tool input
 */
declare const execJsonSchema: JSONSchema;
/**
 * JSON Schema for bashlet_read_file tool input
 */
declare const readFileJsonSchema: JSONSchema;
/**
 * JSON Schema for bashlet_write_file tool input
 */
declare const writeFileJsonSchema: JSONSchema;
/**
 * JSON Schema for bashlet_list_dir tool input
 */
declare const listDirJsonSchema: JSONSchema;

export { type JSONSchema as J, execJsonSchema as e, listDirJsonSchema as l, readFileJsonSchema as r, writeFileJsonSchema as w };
