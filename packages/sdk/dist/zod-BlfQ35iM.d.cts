import { z } from 'zod';

/**
 * Schema for bashlet_exec tool input
 */
declare const execSchema: z.ZodObject<{
    command: z.ZodString;
    workdir: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    command: string;
    workdir?: string | undefined;
}, {
    command: string;
    workdir?: string | undefined;
}>;
/**
 * Schema for bashlet_read_file tool input
 */
declare const readFileSchema: z.ZodObject<{
    path: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string;
}, {
    path: string;
}>;
/**
 * Schema for bashlet_write_file tool input
 */
declare const writeFileSchema: z.ZodObject<{
    path: z.ZodString;
    content: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string;
    content: string;
}, {
    path: string;
    content: string;
}>;
/**
 * Schema for bashlet_list_dir tool input
 */
declare const listDirSchema: z.ZodObject<{
    path: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string;
}, {
    path: string;
}>;
type ExecInput = z.infer<typeof execSchema>;
type ReadFileInput = z.infer<typeof readFileSchema>;
type WriteFileInput = z.infer<typeof writeFileSchema>;
type ListDirInput = z.infer<typeof listDirSchema>;

export { type ExecInput as E, type ListDirInput as L, type ReadFileInput as R, type WriteFileInput as W, execSchema as e, listDirSchema as l, readFileSchema as r, writeFileSchema as w };
