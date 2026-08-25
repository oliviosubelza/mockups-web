/**
 * Contract for dynamic task forms — the model a task is *defined* in, and the
 * payload one gets *answered* with.
 *
 * The point of it is that a task has no type of its own. "Take a photo", "run a
 * checklist", "survey N slow-moving products" are all the same thing: an ordered
 * list of typed fields. Adding a kind of task therefore never touches this file,
 * and never touches the schema a backend would store it in.
 *
 * Kept in its own module rather than inside `types/index.ts` because it is a
 * self-contained contract, and re-exported from there so `@/types` stays the one
 * import path.
 */

export type InputType =
  | "short_text"
  | "long_text"
  | "number"
  | "decimal"
  | "date"
  | "datetime"
  | "time"
  | "boolean"
  /** Static-options select shown as a dropdown. Answers exactly like `single_select`. */
  | "dropdown"
  | "single_select"
  | "multi_select"
  | "rating"
  /** Any attachment the phone can hand over — answers like the photo types. */
  | "file"
  | "photo"
  | "photo_multiple"
  /** Selector wired to a catalogue (products, batches…) — options are fetched. */
  | "catalog_select"
  /** Repeatable container of child fields. */
  | "group"
  /** Title / separator only; captures no value. */
  | "section";

/**
 * Catalogue a `catalog_select` draws from. Extensible: add a provider, add a key.
 *
 * Two kinds sit here and the distinction is worth keeping in mind when adding more.
 * `product` / `batch` / `unit_measure` describe *what is being counted*; `employee` /
 * `distributor` / `city` / `warehouse` describe *where and by whom* — the master data a
 * task is filed against. Both are looked up rather than stored, which is the only
 * property the field component cares about.
 */
export type DataSource =
  | "product"
  | "batch"
  | "unit_measure"
  | "employee"
  | "distributor"
  | "city"
  | "warehouse";

export type LayoutWidth = "full" | "half";

export interface FieldValidation {
  /** number / decimal / rating */
  min?: number;
  max?: number;
  /** short_text / long_text */
  minLength?: number;
  maxLength?: number;
  regex?: string;
  /** group */
  minRows?: number;
  maxRows?: number;
  /** file / photo / photo_multiple */
  accept?: string[];
  maxFiles?: number;
}

export interface FieldOption {
  id: string;
  label: string;
  value: string;
  order: number;
}

export interface Field {
  /** uuid, client-side. */
  id: string;
  /** Stable slug derived from the label, editable, unique within the form. */
  code: string;
  label: string;
  /**
   * Whether the label is printed above the control when answering.
   *
   * Optional, and absent means `true` — so every definition written before this
   * existed stays valid, and the flag never has to be filled in to get the normal
   * behaviour. The label itself is always present regardless: it is the field's name
   * in the builder and what `code` is derived from. This only decides whether the
   * person answering sees it, which is what a field inside a tight repeatable row
   * usually does not need.
   */
  showLabel?: boolean;
  helpText?: string;
  inputType: InputType;
  /** Required when `inputType === 'catalog_select'`; forbidden otherwise. */
  dataSource?: DataSource;
  isRequired: boolean;
  /** Only meaningful on `group`. */
  isRepeatable: boolean;
  layoutWidth: LayoutWidth;
  order: number;
  validation: FieldValidation;
  /** Only on dropdown / single_select / multi_select — static options, no fetching. */
  options?: FieldOption[];
  /** Only on `group`. */
  children?: Field[];
}

/**
 * What an unset `TaskForm.color` resolves to.
 *
 * Lives with the contract rather than in the builder's lib because "absent means this"
 * is part of the contract: a list row, the builder's header and anything a backend
 * later renders all have to resolve a missing colour the same way, and hanging the
 * default off one feature would make that feature the only place that knows. It is the
 * first preset of the shared `ColorPicker` — the app's own blue — so an untouched task
 * looks exactly like one somebody deliberately left as it was.
 */
export const DEFAULT_TASK_COLOR = "#264bc5";

export interface TaskForm {
  id: string;
  name: string;
  description?: string;
  category?: string;
  /**
   * The task's own colour, as a `#rrggbb` hex.
   *
   * Optional, and absent means `DEFAULT_TASK_COLOR` — every definition written before
   * this existed (the seed form, the seeded templates, `createEmptyForm`) stays valid
   * without being backfilled, and nothing has to store a colour to look right. Nothing
   * writes the default in: an unset colour stays unset so the fallback stays the one
   * place the default is decided.
   */
  color?: string;
  isTemplate: boolean;
  /** Whether answering it is mandatory during the visit. */
  isResponseRequired: boolean;
  /** When true, `validFrom` / `validTo` are ignored. */
  isAlwaysActive: boolean;
  validFrom?: string;
  validTo?: string;
  /** `null` means unlimited. */
  maxResponsesPerVisit?: number | null;
  freqType?: "daily" | "weekly" | "biweekly" | "monthly";
  /** 0..6 */
  freqDays?: number[];
  fields: Field[];
}

/**
 * One answer to one field. Only the slot matching the field's type is filled —
 * the shape is a union flattened into optionals so a backend can store it as one
 * table with typed columns.
 */
export interface AnswerValue {
  fieldCode: string;
  /** Present when the field lives inside a group. */
  groupRowIndex?: number;
  /** short_text / long_text */
  text?: string;
  /** number / decimal / rating */
  number?: number;
  /** date / datetime / time, ISO */
  date?: string;
  boolean?: boolean;
  /** dropdown / single_select */
  optionValue?: string;
  /** multi_select */
  optionValues?: string[];
  /** catalog_select */
  ref?: { id: string; source: DataSource };
  /** file / photo / photo_multiple */
  files?: { url: string; kind?: string }[];
}

export interface TaskResponsePayload {
  taskId: string;
  answers: AnswerValue[];
}
