import fs from "node:fs";
import Ajv from "ajv";

const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });
const completeSchema = JSON.parse(fs.readFileSync(new URL("../schemas/video-analysis.schema.json", import.meta.url), "utf8"));
const blockedSchema = JSON.parse(fs.readFileSync(new URL("../schemas/blocked-video.schema.json", import.meta.url), "utf8"));
const completeValidate = ajv.compile(completeSchema);
const blockedValidate = ajv.compile(blockedSchema);

export function schemaFor(record) {
  return record?.collection?.access === "blocked" ? blockedSchema : completeSchema;
}

export function validateRecord(record) {
  const validate = record?.collection?.access === "blocked" ? blockedValidate : completeValidate;
  const valid = Boolean(validate(record));
  return {
    valid,
    schema: schemaFor(record),
    errors: valid ? [] : formatErrors(validate.errors || []),
  };
}

export function formatErrors(errors) {
  return errors.map((error) => {
    const field = error.instancePath.replace(/^\//, "").replaceAll("/", ".") || error.params?.missingProperty || "record";
    return `${field}: ${error.message}`;
  });
}
