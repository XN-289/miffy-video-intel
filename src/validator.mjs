import fs from "node:fs";
import Ajv from "ajv";

const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });
const completeSchema = JSON.parse(fs.readFileSync(new URL("../schemas/video-analysis.schema.json", import.meta.url), "utf8"));
const blockedSchema = JSON.parse(fs.readFileSync(new URL("../schemas/blocked-video.schema.json", import.meta.url), "utf8"));
const completeValidate = ajv.compile(completeSchema);
const blockedValidate = ajv.compile(blockedSchema);
const timingPattern = /(?:\d{1,2}:\d{2})|(?:\d+(?:\.\d+)?\s*(?:s|sec|second|seconds|秒))/i;

function semanticErrors(record) {
  if (record?.collection?.access === "blocked") return [];

  const errors = [];
  const evidence = record?.collection?.evidence || [];
  const visualNotes = record?.video?.content?.visual_notes || [];
  const watchedVideo = evidence.some((item) => item.source === "video");
  const timestampedNotes = visualNotes.filter((note) => timingPattern.test(note));

  if (record?.collection?.access === "visible" && !watchedVideo) {
    errors.push("collection.access: visible requires at least one evidence entry with source video");
  }

  if (watchedVideo) {
    if (visualNotes.length < 2) {
      errors.push("video.content.visual_notes: direct video evidence requires at least two concrete visual notes");
    }
    if (timestampedNotes.length < 2) {
      errors.push("video.content.visual_notes: direct video evidence requires at least two timestamped notes");
    }
  }

  return errors;
}

export function schemaFor(record) {
  return record?.collection?.access === "blocked" ? blockedSchema : completeSchema;
}

export function validateRecord(record) {
  const validate = record?.collection?.access === "blocked" ? blockedValidate : completeValidate;
  const valid = Boolean(validate(record));
  const errors = valid ? semanticErrors(record) : formatErrors(validate.errors || []);
  return {
    valid: valid && errors.length === 0,
    schema: schemaFor(record),
    errors,
  };
}

export function formatErrors(errors) {
  return errors.map((error) => {
    const field = error.instancePath.replace(/^\//, "").replaceAll("/", ".") || error.params?.missingProperty || "record";
    return `${field}: ${error.message}`;
  });
}
